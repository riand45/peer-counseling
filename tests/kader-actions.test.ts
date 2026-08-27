import { describe, expect, it } from "vitest";
import { getKaderDashboardCore, updateKaderStatusCore } from "@/lib/kader/core";
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
