import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createStudentIdentity, listAvailableKader, startSession, endSession } from "@/lib/student/actions";
import {
  getServiceClient,
  deleteTestStudentIdentity,
  createTestUser,
  deleteTestUser,
  createTestStudentIdentity,
  createTestSession,
  deleteTestSession,
} from "./helpers";

describe("createStudentIdentity", () => {
  it("creates a student_identities row with the given id and nickname", async () => {
    const localId = randomUUID();
    try {
      const result = await createStudentIdentity({ localId, nickname: "Sahabat Langit" });
      expect(result.id).toBe(localId);

      const service = getServiceClient();
      const { data, error } = await service
        .from("student_identities")
        .select("id, nickname, avatar_seed")
        .eq("id", localId)
        .single();

      expect(error).toBeNull();
      expect(data?.nickname).toBe("Sahabat Langit");
      expect(data?.avatar_seed).toBeTruthy();
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });

  it("allows creating an identity without a nickname", async () => {
    const localId = randomUUID();
    try {
      const result = await createStudentIdentity({ localId });
      expect(result.id).toBe(localId);
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });
});

describe("listAvailableKader", () => {
  it("returns only verified kader, with the expected shape", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const verifiedKader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(verifiedKader.id));

      const service = getServiceClient();
      await service
        .from("profiles")
        .update({ bio: "Suka dengerin cerita", topics: ["akademik", "keluarga"], status: "available" })
        .eq("id", verifiedKader.id);

      const unverifiedKader = await createTestUser("kader", { verified: false });
      cleanup.push(() => deleteTestUser(unverifiedKader.id));

      const guru = await createTestUser("guru", { verified: true });
      cleanup.push(() => deleteTestUser(guru.id));

      const result = await listAvailableKader();
      const ids = result.map((k) => k.id);

      expect(ids).toContain(verifiedKader.id);
      expect(ids).not.toContain(unverifiedKader.id);
      expect(ids).not.toContain(guru.id);

      const found = result.find((k) => k.id === verifiedKader.id)!;
      expect(found.bio).toBe("Suka dengerin cerita");
      expect(found.topics).toEqual(["akademik", "keluarga"]);
      expect(found.status).toBe("available");
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });
});

describe("startSession", () => {
  it("creates an active session assigned to an available kader", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const kader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kader.id));
      const service = getServiceClient();
      await service.from("profiles").update({ status: "available" }).eq("id", kader.id);

      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      const { sessionId } = await startSession({
        studentLocalId: localId,
        topics: ["akademik", "perasaan"],
        kaderId: kader.id,
      });
      cleanup.push(() => deleteTestSession(sessionId));

      const { data, error } = await service
        .from("sessions")
        .select("status, assigned_to, topics, started_at")
        .eq("id", sessionId)
        .single();

      expect(error).toBeNull();
      expect(data?.status).toBe("active");
      expect(data?.assigned_to).toBe(kader.id);
      expect(data?.topics).toEqual(["akademik", "perasaan"]);
      expect(data?.started_at).toBeTruthy();
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });

  it("rejects starting a session with a kader who is not available", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const kader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kader.id));
      const service = getServiceClient();
      await service.from("profiles").update({ status: "busy" }).eq("id", kader.id);

      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      await expect(
        startSession({ studentLocalId: localId, topics: ["akademik"], kaderId: kader.id }),
      ).rejects.toThrow("tidak tersedia");

      const { data: sessions } = await service
        .from("sessions")
        .select("id")
        .eq("student_local_id", localId);
      expect(sessions).toHaveLength(0);
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });
});

describe("endSession", () => {
  it("marks a session ended when called by its owning student", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await endSession({ sessionId, studentLocalId: localId });

      const service = getServiceClient();
      const { data } = await service
        .from("sessions")
        .select("status, ended_at")
        .eq("id", sessionId)
        .single();

      expect(data?.status).toBe("ended");
      expect(data?.ended_at).toBeTruthy();
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });

  it("rejects ending a session that belongs to a different student", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const otherLocalId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(otherLocalId));

      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(
        endSession({ sessionId, studentLocalId: otherLocalId }),
      ).rejects.toThrow("Tidak diizinkan");

      const service = getServiceClient();
      const { data: session } = await service
        .from("sessions")
        .select("status, ended_at")
        .eq("id", sessionId)
        .single();
      expect(session?.status).not.toBe("ended");
      expect(session?.ended_at).toBeNull();
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });
});
