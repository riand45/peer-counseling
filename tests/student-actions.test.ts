import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  createStudentIdentity,
  listAvailableKader,
  startSession,
  endSession,
  getStudentSessions,
  getStudentProfile,
  updateStudentProfile,
  deleteStudentIdentity,
  submitSessionReport,
} from "@/lib/student/actions";
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

  it("rejects starting a session with an unverified kader even if status is available", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const kader = await createTestUser("kader", { verified: false });
      cleanup.push(() => deleteTestUser(kader.id));
      const service = getServiceClient();
      await service.from("profiles").update({ status: "available" }).eq("id", kader.id);

      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      await expect(
        startSession({ studentLocalId: localId, topics: ["akademik"], kaderId: kader.id }),
      ).rejects.toThrow("Kader tidak ditemukan");
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

describe("getStudentSessions", () => {
  it("returns this student's sessions with kader name, topics, status, and latest message", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const kader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kader.id));
      const service = getServiceClient();
      await service.from("profiles").update({ full_name: "Nadia" }).eq("id", kader.id);

      const sessionId = await createTestSession({
        studentLocalId: localId,
        assignedTo: kader.id,
        topics: ["akademik"],
      });
      cleanup.push(() => deleteTestSession(sessionId));
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);
      await service.from("messages").insert({ session_id: sessionId, sender_role: "kader", body: "Halo!" });

      const result = await getStudentSessions({ studentLocalId: localId });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(sessionId);
      expect(result[0].kaderName).toBe("Nadia");
      expect(result[0].topics).toEqual(["akademik"]);
      expect(result[0].status).toBe("active");
      expect(result[0].lastMessagePreview).toBe("Halo!");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
    }
  });

  it("excludes other students' sessions", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const otherLocalId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(otherLocalId));

      const otherSessionId = await createTestSession({ studentLocalId: otherLocalId });
      cleanup.push(() => deleteTestSession(otherSessionId));

      const result = await getStudentSessions({ studentLocalId: localId });
      expect(result).toEqual([]);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
    }
  });
});

describe("getStudentProfile", () => {
  it("returns the nickname and avatar seed for an existing identity", async () => {
    const localId = await createTestStudentIdentity();
    try {
      const service = getServiceClient();
      await service
        .from("student_identities")
        .update({ nickname: "Sahabat Langit", avatar_seed: "panda" })
        .eq("id", localId);

      const profile = await getStudentProfile({ studentLocalId: localId });
      expect(profile.nickname).toBe("Sahabat Langit");
      expect(profile.avatarSeed).toBe("panda");
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });

  it("throws for an identity that does not exist", async () => {
    await expect(getStudentProfile({ studentLocalId: randomUUID() })).rejects.toThrow(
      "Identitas tidak ditemukan",
    );
  });
});

describe("updateStudentProfile", () => {
  it("updates the nickname", async () => {
    const localId = await createTestStudentIdentity();
    try {
      await updateStudentProfile({ studentLocalId: localId, nickname: "Bintang Malam" });
      const service = getServiceClient();
      const { data } = await service
        .from("student_identities")
        .select("nickname")
        .eq("id", localId)
        .single();
      expect(data?.nickname).toBe("Bintang Malam");
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });

  it("clears the nickname when given a whitespace-only string", async () => {
    const localId = await createTestStudentIdentity();
    try {
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: "Ada Nama" }).eq("id", localId);

      await updateStudentProfile({ studentLocalId: localId, nickname: "  " });
      const { data } = await service
        .from("student_identities")
        .select("nickname")
        .eq("id", localId)
        .single();
      expect(data?.nickname).toBeNull();
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });

  it("updates the avatar seed when it is a known seed", async () => {
    const localId = await createTestStudentIdentity();
    try {
      await updateStudentProfile({ studentLocalId: localId, avatarSeed: "koala" });
      const service = getServiceClient();
      const { data } = await service
        .from("student_identities")
        .select("avatar_seed")
        .eq("id", localId)
        .single();
      expect(data?.avatar_seed).toBe("koala");
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });

  it("rejects an unknown avatar seed", async () => {
    const localId = await createTestStudentIdentity();
    try {
      await expect(
        updateStudentProfile({ studentLocalId: localId, avatarSeed: "naga" }),
      ).rejects.toThrow("Avatar tidak dikenal");
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });
});

describe("submitSessionReport", () => {
  it("inserts a session_reports row for the reporting student's own session", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await submitSessionReport({
        sessionId,
        studentLocalId: localId,
        reason: "other",
        details: "Detail tambahan",
      });

      const service = getServiceClient();
      const { data } = await service
        .from("session_reports")
        .select("reason, details, status")
        .eq("session_id", sessionId)
        .single();
      expect(data?.reason).toBe("other");
      expect(data?.details).toBe("Detail tambahan");
      expect(data?.status).toBe("open");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
    }
  });

  it("rejects reporting a session that belongs to a different student", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const otherLocalId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(otherLocalId));
      const sessionId = await createTestSession({ studentLocalId: otherLocalId });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(
        submitSessionReport({ sessionId, studentLocalId: localId, reason: "uncomfortable" }),
      ).rejects.toThrow("Tidak diizinkan");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
    }
  });
});

describe("deleteStudentIdentity", () => {
  it("deletes the identity and cascades to delete its sessions", async () => {
    const localId = await createTestStudentIdentity();
    const sessionId = await createTestSession({ studentLocalId: localId });
    try {
      await deleteStudentIdentity({ studentLocalId: localId });

      const service = getServiceClient();
      const { data: identity } = await service
        .from("student_identities")
        .select("id")
        .eq("id", localId)
        .maybeSingle();
      expect(identity).toBeNull();

      const { data: session } = await service
        .from("sessions")
        .select("id")
        .eq("id", sessionId)
        .maybeSingle();
      expect(session).toBeNull();
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });
});
