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

describe("schema: profiles privileged columns are protected from self-update", () => {
  it("a kader cannot self-promote to role=guru / is_verified via their own client", async () => {
    const service = getServiceClient();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const kader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kader.id));

      const { client: asKader } = await signInTestUser(kader.email, kader.password);
      // Coba naikkan hak sendiri, sekaligus ubah satu kolom biasa di request
      // yang sama — kolom biasa harus tetap ter-update.
      const { error: updateError } = await asKader
        .from("profiles")
        .update({ role: "guru", is_verified: true, bio: "bio baru" })
        .eq("id", kader.id);
      expect(updateError).toBeNull();

      const { data: after, error: readError } = await service
        .from("profiles")
        .select("role, is_verified, bio")
        .eq("id", kader.id)
        .single();
      expect(readError).toBeNull();
      expect(after?.role).toBe("kader");
      expect(after?.is_verified).toBe(true);
      expect(after?.bio).toBe("bio baru");
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });

  it("an unverified kader cannot self-verify", async () => {
    const service = getServiceClient();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const kader = await createTestUser("kader");
      cleanup.push(() => deleteTestUser(kader.id));

      const { client: asKader } = await signInTestUser(kader.email, kader.password);
      await asKader.from("profiles").update({ is_verified: true }).eq("id", kader.id);

      const { data: after } = await service
        .from("profiles")
        .select("is_verified")
        .eq("id", kader.id)
        .single();
      expect(after?.is_verified).toBe(false);
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });
});

describe("schema: is_guru() requires verification", () => {
  it("an unverified guru is not treated as guru and cannot read other profiles", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const guru = await createTestUser("guru");
      cleanup.push(() => deleteTestUser(guru.id));
      const kader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kader.id));

      const { client: asGuru } = await signInTestUser(guru.email, guru.password);
      const { data: isGuru, error: rpcError } = await asGuru.rpc("is_guru");
      expect(rpcError).toBeNull();
      expect(isGuru).toBe(false);

      const { data: otherProfiles } = await asGuru
        .from("profiles")
        .select("id")
        .eq("id", kader.id);
      expect(otherProfiles).toHaveLength(0);
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });

  it("a verified guru is treated as guru and can read other profiles", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const guru = await createTestUser("guru", { verified: true });
      cleanup.push(() => deleteTestUser(guru.id));
      const kader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kader.id));

      const { client: asGuru } = await signInTestUser(guru.email, guru.password);
      const { data: isGuru, error: rpcError } = await asGuru.rpc("is_guru");
      expect(rpcError).toBeNull();
      expect(isGuru).toBe(true);

      const { data: otherProfiles } = await asGuru
        .from("profiles")
        .select("id")
        .eq("id", kader.id);
      expect(otherProfiles).toHaveLength(1);
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
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
        .insert({ student_local_id: localId, assigned_to: kaderA.id, topics: ["akademik"] })
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
        .insert({ student_local_id: localId, assigned_to: kader.id, topics: ["bullying"] })
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
