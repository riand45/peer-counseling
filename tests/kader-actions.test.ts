import { describe, expect, it } from "vitest";
import {
  getKaderDashboardCore,
  updateKaderStatusCore,
  endKaderSessionCore,
  getSessionStudentInfoCore,
  updateKaderBioCore,
  updateKaderTopicsCore,
  getAvailableKaderForTransferCore,
  transferSessionCore,
  escalateSessionCore,
} from "@/lib/kader/core";
import { MAX_BIO_LENGTH } from "@/lib/kader/types";
import {
  getServiceClient,
  createSignedInTestKader,
  deleteTestUser,
  createTestStudentIdentity,
  deleteTestStudentIdentity,
  createTestSession,
  deleteTestSession,
} from "./helpers";

describe("getKaderDashboardCore", () => {
  it("returns the kader's own name/status and an empty list with no sessions", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    try {
      const result = await getKaderDashboardCore(client);
      expect(result.status).toBe("available");
      expect(result.fullName).toBeTruthy();
      expect(result.activeSessions).toEqual([]);
    } finally {
      await deleteTestUser(id);
    }
  });

  it("lists only this kader's active sessions, with topic, preview, and a nickname-based display name", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: "Sahabat Langit" }).eq("id", localId);

      const sessionId = await createTestSession({
        studentLocalId: localId,
        assignedTo: id,
        topics: ["bullying"],
      });
      cleanup.push(() => deleteTestSession(sessionId));
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);
      await service
        .from("messages")
        .insert({ session_id: sessionId, sender_role: "student", body: "Halo kak" });

      const result = await getKaderDashboardCore(client);
      expect(result.activeSessions).toHaveLength(1);
      const session = result.activeSessions[0];
      expect(session.id).toBe(sessionId);
      expect(session.topics).toEqual(["bullying"]);
      expect(session.studentDisplayName).toBe("Sahabat Langit");
      expect(session.lastMessagePreview).toBe("Halo kak");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("falls back to an avatar-based display name when the student has no nickname", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const service = getServiceClient();
      await service
        .from("student_identities")
        .update({ nickname: null, avatar_seed: "panda" })
        .eq("id", localId);

      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      const result = await getKaderDashboardCore(client);
      expect(result.activeSessions[0].studentDisplayName).toBe("Anonim_Panda");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("excludes sessions assigned to a different kader and non-active sessions", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const other = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      const otherSessionId = await createTestSession({ studentLocalId: localId, assignedTo: other.id });
      cleanup.push(() => deleteTestSession(otherSessionId));
      const service = getServiceClient();
      await service.from("sessions").update({ status: "active" }).eq("id", otherSessionId);

      const endedSessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(endedSessionId));
      await service.from("sessions").update({ status: "ended" }).eq("id", endedSessionId);

      const result = await getKaderDashboardCore(client);
      expect(result.activeSessions).toEqual([]);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(other.id);
    }
  });
});

describe("updateKaderStatusCore", () => {
  it("updates the signed-in kader's own status", async () => {
    const { id, client } = await createSignedInTestKader({ status: "offline" });
    try {
      await updateKaderStatusCore(client, "available");
      const service = getServiceClient();
      const { data } = await service.from("profiles").select("status").eq("id", id).single();
      expect(data?.status).toBe("available");
    } finally {
      await deleteTestUser(id);
    }
  });
});

describe("endKaderSessionCore", () => {
  it("marks a session ended when called by its assigned kader", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));

      await endKaderSessionCore(client, sessionId);

      const service = getServiceClient();
      const { data } = await service.from("sessions").select("status, ended_at").eq("id", sessionId).single();
      expect(data?.status).toBe("ended");
      expect(data?.ended_at).toBeTruthy();
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("rejects ending a session assigned to a different kader", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const owner = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: owner.id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(endKaderSessionCore(client, sessionId)).rejects.toThrow("Gagal mengakhiri sesi");

      const service = getServiceClient();
      const { data } = await service.from("sessions").select("status").eq("id", sessionId).single();
      expect(data?.status).not.toBe("ended");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(owner.id);
    }
  });
});

describe("getSessionStudentInfoCore", () => {
  it("returns topics, status, and the student's display name for the assigned kader", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: "Sahabat Langit" }).eq("id", localId);

      const sessionId = await createTestSession({
        studentLocalId: localId,
        assignedTo: id,
        topics: ["keluarga"],
      });
      cleanup.push(() => deleteTestSession(sessionId));
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      const info = await getSessionStudentInfoCore(client, sessionId);
      expect(info.displayName).toBe("Sahabat Langit");
      expect(info.topics).toEqual(["keluarga"]);
      expect(info.status).toBe("active");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("rejects a kader who is not assigned to the session", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const owner = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: owner.id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(getSessionStudentInfoCore(client, sessionId)).rejects.toThrow("Sesi tidak ditemukan");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(owner.id);
    }
  });
});

describe("updateKaderBioCore", () => {
  it("trims and saves the bio for the signed-in kader", async () => {
    const { id, client } = await createSignedInTestKader();
    try {
      await updateKaderBioCore(client, "  Suka dengerin cerita orang lain.  ");
      const service = getServiceClient();
      const { data } = await service.from("profiles").select("bio").eq("id", id).single();
      expect(data?.bio).toBe("Suka dengerin cerita orang lain.");
    } finally {
      await deleteTestUser(id);
    }
  });

  it("stores an empty/whitespace-only bio as null", async () => {
    const { id, client } = await createSignedInTestKader();
    try {
      await updateKaderBioCore(client, "   ");
      const service = getServiceClient();
      const { data } = await service.from("profiles").select("bio").eq("id", id).single();
      expect(data?.bio).toBeNull();
    } finally {
      await deleteTestUser(id);
    }
  });

  it("rejects a bio longer than the max length", async () => {
    const { id, client } = await createSignedInTestKader();
    try {
      await expect(updateKaderBioCore(client, "a".repeat(MAX_BIO_LENGTH + 1))).rejects.toThrow(
        "Bio maksimal",
      );
    } finally {
      await deleteTestUser(id);
    }
  });
});

describe("updateKaderTopicsCore", () => {
  it("updates the signed-in kader's topics", async () => {
    const { id, client } = await createSignedInTestKader();
    try {
      await updateKaderTopicsCore(client, ["akademik", "keluarga"]);
      const service = getServiceClient();
      const { data } = await service.from("profiles").select("topics").eq("id", id).single();
      expect(data?.topics).toEqual(["akademik", "keluarga"]);
    } finally {
      await deleteTestUser(id);
    }
  });
});

describe("getAvailableKaderForTransferCore", () => {
  it("lists other verified, available kader, excluding self, busy, and unverified kader", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const other = await createSignedInTestKader({ status: "available" });
    const busy = await createSignedInTestKader({ status: "busy" });
    const unverified = await createSignedInTestKader({ status: "available", verified: false });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));

      const result = await getAvailableKaderForTransferCore(client, sessionId);
      const ids = result.map((k) => k.id);
      expect(ids).toContain(other.id);
      expect(ids).not.toContain(id);
      expect(ids).not.toContain(busy.id);
      expect(ids).not.toContain(unverified.id);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(other.id);
      await deleteTestUser(busy.id);
      await deleteTestUser(unverified.id);
    }
  });

  it("throws for a session not assigned to this kader", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const owner = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: owner.id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(getAvailableKaderForTransferCore(client, sessionId)).rejects.toThrow(
        "Sesi tidak ditemukan",
      );
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(owner.id);
    }
  });
});

describe("transferSessionCore", () => {
  it("reassigns the session to the target kader and logs a transfer assignment", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const target = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));
      const service = getServiceClient();
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      await transferSessionCore(client, { sessionId, toKaderId: target.id });

      const { data: session } = await service
        .from("sessions")
        .select("assigned_to")
        .eq("id", sessionId)
        .single();
      expect(session?.assigned_to).toBe(target.id);

      const { data: assignment } = await service
        .from("session_assignments")
        .select("from_id, to_id, changed_by, reason")
        .eq("session_id", sessionId)
        .eq("reason", "transfer")
        .single();
      expect(assignment?.from_id).toBe(id);
      expect(assignment?.to_id).toBe(target.id);
      expect(assignment?.changed_by).toBe(id);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(target.id);
    }
  });

  it("throws for a session id that does not belong to this kader", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const owner = await createSignedInTestKader({ status: "available" });
    const target = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: owner.id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(
        transferSessionCore(client, { sessionId, toKaderId: target.id }),
      ).rejects.toThrow("Sesi tidak ditemukan");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(owner.id);
      await deleteTestUser(target.id);
    }
  });

  it("throws when the target kader is not available", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const target = await createSignedInTestKader({ status: "busy" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(
        transferSessionCore(client, { sessionId, toKaderId: target.id }),
      ).rejects.toThrow("Kader ini sudah tidak tersedia");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(target.id);
    }
  });

  it("rejects an ineligible target at the RPC level, even calling transfer_session directly", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const busyTarget = await createSignedInTestKader({ status: "busy" });
    const unverifiedTarget = await createSignedInTestKader({ status: "available", verified: false });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));

      const busyResult = await client.rpc("transfer_session", {
        p_session_id: sessionId,
        p_to_kader_id: busyTarget.id,
      });
      expect(busyResult.error).toBeTruthy();

      const unverifiedResult = await client.rpc("transfer_session", {
        p_session_id: sessionId,
        p_to_kader_id: unverifiedTarget.id,
      });
      expect(unverifiedResult.error).toBeTruthy();

      const service = getServiceClient();
      const { data: session } = await service.from("sessions").select("assigned_to").eq("id", sessionId).single();
      expect(session?.assigned_to).toBe(id);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(busyTarget.id);
      await deleteTestUser(unverifiedTarget.id);
    }
  });
});

describe("escalateSessionCore", () => {
  it("inserts a pending escalation and flips the session status to escalated", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));
      const service = getServiceClient();
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      await escalateSessionCore(client, { sessionId, reason: "Butuh bantuan guru" });

      const { data: escalation } = await service
        .from("escalations")
        .select("kader_id, reason, status")
        .eq("session_id", sessionId)
        .single();
      expect(escalation?.kader_id).toBe(id);
      expect(escalation?.reason).toBe("Butuh bantuan guru");
      expect(escalation?.status).toBe("pending");

      const { data: session } = await service.from("sessions").select("status").eq("id", sessionId).single();
      expect(session?.status).toBe("escalated");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("allows a null reason", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));

      await escalateSessionCore(client, { sessionId, reason: null });

      const service = getServiceClient();
      const { data: escalation } = await service
        .from("escalations")
        .select("reason")
        .eq("session_id", sessionId)
        .single();
      expect(escalation?.reason).toBeNull();
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("rejects a kader who is not assigned to the session", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const owner = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: owner.id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(escalateSessionCore(client, { sessionId, reason: null })).rejects.toThrow(
        "Gagal mengirim eskalasi",
      );
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(owner.id);
    }
  });
});
