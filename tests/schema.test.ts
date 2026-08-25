import { describe, expect, it } from "vitest";
import {
  createTestStudentIdentity,
  deleteTestStudentIdentity,
  createTestUser,
  deleteTestUser,
  signInTestUser,
  getAnonClient,
  getServiceClient,
} from "./helpers";

describe("schema: anon has no direct access to student-facing tables", () => {
  it("cannot select from sessions", async () => {
    const anon = getAnonClient();
    const { error } = await anon.from("sessions").select("id");
    expect(error?.code).toBe("42501");
  });

  it("cannot insert into student_identities", async () => {
    const anon = getAnonClient();
    const { error } = await anon.from("student_identities").insert({ nickname: "hack" });
    expect(error?.code).toBe("42501");
  });

  it("cannot insert into session_reports", async () => {
    const anon = getAnonClient();
    const { error } = await anon.from("session_reports").insert({
      session_id: "00000000-0000-0000-0000-000000000000",
      reason: "other",
    });
    expect(error?.code).toBe("42501");
  });
});

describe("schema: signup trigger fills in profiles from user metadata", () => {
  it("creates a profiles row with the requested role and is_verified=false", async () => {
    const user = await createTestUser("kader");
    try {
      const service = getServiceClient();
      const { data, error } = await service
        .from("profiles")
        .select("role, is_verified, full_name")
        .eq("id", user.id)
        .single();
      expect(error).toBeNull();
      expect(data?.role).toBe("kader");
      expect(data?.is_verified).toBe(false);
      expect(data?.full_name).toBe("Test kader");
    } finally {
      await deleteTestUser(user.id);
    }
  });
});

describe("schema: kader/guru RLS scoping on sessions", () => {
  it("a kader can only see sessions assigned to them, not another kader's", async () => {
    const service = getServiceClient();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const kaderA = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kaderA.id));
      const kaderB = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kaderB.id));
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const { data: session, error: sessionError } = await service
        .from("sessions")
        .insert({ student_local_id: localId, assigned_to: kaderA.id, topic: "akademik" })
        .select("id")
        .single();
      expect(sessionError).toBeNull();
      cleanup.push(async () => {
        await service.from("sessions").delete().eq("id", session!.id);
      });

      const { client: asKaderA } = await signInTestUser(kaderA.email, kaderA.password);
      const { data: seenByA } = await asKaderA
        .from("sessions")
        .select("id")
        .eq("id", session!.id);
      expect(seenByA).toHaveLength(1);

      const { client: asKaderB } = await signInTestUser(kaderB.email, kaderB.password);
      const { data: seenByB } = await asKaderB
        .from("sessions")
        .select("id")
        .eq("id", session!.id);
      expect(seenByB).toHaveLength(0);
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });

  it("a guru can see any session", async () => {
    const service = getServiceClient();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const kader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kader.id));
      const guru = await createTestUser("guru", { verified: true });
      cleanup.push(() => deleteTestUser(guru.id));
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const { data: session, error: sessionError } = await service
        .from("sessions")
        .insert({ student_local_id: localId, assigned_to: kader.id, topic: "bullying" })
        .select("id")
        .single();
      expect(sessionError).toBeNull();
      cleanup.push(async () => {
        await service.from("sessions").delete().eq("id", session!.id);
      });

      const { client: asGuru } = await signInTestUser(guru.email, guru.password);
      const { data: seenByGuru } = await asGuru
        .from("sessions")
        .select("id")
        .eq("id", session!.id);
      expect(seenByGuru).toHaveLength(1);
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });
});
