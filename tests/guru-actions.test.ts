import { describe, expect, it } from "vitest";
import { getGuruDashboardCore } from "@/lib/guru/core";
import {
  getServiceClient,
  createSignedInTestGuru,
  createSignedInTestKader,
  deleteTestUser,
  createTestStudentIdentity,
  deleteTestStudentIdentity,
  createTestSession,
  deleteTestSession,
} from "./helpers";

describe("getGuruDashboardCore", () => {
  it("returns the guru's own name and well-formed empty-safe counts/lists", async () => {
    const { id, client } = await createSignedInTestGuru();
    try {
      const result = await getGuruDashboardCore(client);
      expect(result.fullName).toBeTruthy();
      expect(result.counts.total).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.attention)).toBe(true);
      expect(Array.isArray(result.activity)).toBe(true);
    } finally {
      await deleteTestUser(id);
    }
  });

  it("counts a newly created active session and lists it in Aktivitas Terbaru", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const before = await getGuruDashboardCore(client);

      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: "Sahabat Guru" }).eq("id", localId);

      const kader = await createSignedInTestKader({ status: "available" });
      cleanup.push(() => deleteTestUser(kader.id));

      const sessionId = await createTestSession({
        studentLocalId: localId,
        assignedTo: kader.id,
        topics: ["akademik"],
      });
      cleanup.push(() => deleteTestSession(sessionId));
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      const after = await getGuruDashboardCore(client);
      expect(after.counts.total).toBe(before.counts.total + 1);
      expect(after.counts.active).toBe(before.counts.active + 1);

      const activityItem = after.activity.find((item) => item.sessionId === sessionId);
      expect(activityItem).toBeTruthy();
      expect(activityItem?.studentDisplayName).toBe("Sahabat Guru");
      expect(activityItem?.status).toBe("active");
      expect(activityItem?.topics).toEqual(["akademik"]);
      expect(activityItem?.assignedKaderName).toBeTruthy();
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("surfaces a pending escalation in the Butuh Perhatian list", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      const kader = await createSignedInTestKader({ status: "available" });
      cleanup.push(() => deleteTestUser(kader.id));

      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: kader.id });
      cleanup.push(() => deleteTestSession(sessionId));

      const service = getServiceClient();
      await service.from("escalations").insert({
        session_id: sessionId,
        kader_id: kader.id,
        reason: "Tanda-tanda kecemasan berlebih",
        status: "pending",
      });

      const result = await getGuruDashboardCore(client);
      const item = result.attention.find((entry) => entry.sessionId === sessionId);
      expect(item).toBeTruthy();
      expect(item?.kind).toBe("escalation");
      expect(item?.detail).toBe("Tanda-tanda kecemasan berlebih");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("surfaces an open session report in the Butuh Perhatian list", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      const service = getServiceClient();
      await service.from("session_reports").insert({
        session_id: sessionId,
        reason: "uncomfortable",
        details: "Kata-kata tidak pantas terdeteksi",
        status: "open",
      });

      const result = await getGuruDashboardCore(client);
      const item = result.attention.find((entry) => entry.sessionId === sessionId);
      expect(item).toBeTruthy();
      expect(item?.kind).toBe("report");
      expect(item?.detail).toBe("Kata-kata tidak pantas terdeteksi");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });
});
