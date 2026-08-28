import { describe, expect, it } from "vitest";
import { getGuruDashboardCore } from "@/lib/guru/core";
import { listConsultationsCore } from "@/lib/guru/core";
import { getConsultationDetailCore } from "@/lib/guru/core";
import { endConsultationAsGuruCore, takeOverConsultationCore, archiveSessionCore } from "@/lib/guru/core";
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

      // counts.total/active are global, unscoped aggregates over a table other
      // concurrently-run test files also insert into and delete from — a
      // before/after delta on them (even a >= one) is inherently racy against
      // a shared live Supabase project. The activity list is scoped by
      // sessionId below and is the part of this test that's actually
      // deterministic; counts' shape is covered separately by the
      // "well-formed empty-safe counts/lists" test above.
      const after = await getGuruDashboardCore(client);

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

  it("excludes an archived session from Aktivitas Terbaru", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));
      const service = getServiceClient();
      await service
        .from("sessions")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", sessionId);

      const result = await getGuruDashboardCore(client);
      expect(result.activity.find((item) => item.sessionId === sessionId)).toBeUndefined();
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });
});

describe("listConsultationsCore", () => {
  it("finds a session by a unique student nickname and returns kader/topic/status", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const uniqueName = `UjiDaftar-${Date.now()}`;
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: uniqueName }).eq("id", localId);

      const kader = await createSignedInTestKader({ status: "available" });
      cleanup.push(() => deleteTestUser(kader.id));

      const sessionId = await createTestSession({
        studentLocalId: localId,
        assignedTo: kader.id,
        topics: ["keluarga"],
      });
      cleanup.push(() => deleteTestSession(sessionId));
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      const result = await listConsultationsCore(client, { search: uniqueName, page: 1 });
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].sessionId).toBe(sessionId);
      expect(result.items[0].studentDisplayName).toBe(uniqueName);
      expect(result.items[0].topics).toEqual(["keluarga"]);
      expect(result.items[0].status).toBe("active");
      expect(result.items[0].assignedKaderName).toBeTruthy();
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("filters by status", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const uniqueName = `UjiStatus-${Date.now()}`;
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: uniqueName }).eq("id", localId);

      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));
      await service.from("sessions").update({ status: "ended" }).eq("id", sessionId);

      const activeResult = await listConsultationsCore(client, {
        status: "active",
        search: uniqueName,
        page: 1,
      });
      expect(activeResult.items).toHaveLength(0);

      const endedResult = await listConsultationsCore(client, {
        status: "ended",
        search: uniqueName,
        page: 1,
      });
      expect(endedResult.items).toHaveLength(1);
      expect(endedResult.items[0].sessionId).toBe(sessionId);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("paginates results with a small page size", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const uniquePrefix = `UjiHalaman-${Date.now()}`;
      const service = getServiceClient();
      const sessionIds: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const localId = await createTestStudentIdentity();
        cleanup.push(() => deleteTestStudentIdentity(localId));
        await service
          .from("student_identities")
          .update({ nickname: `${uniquePrefix}-${i}` })
          .eq("id", localId);
        const sessionId = await createTestSession({ studentLocalId: localId });
        cleanup.push(() => deleteTestSession(sessionId));
        sessionIds.push(sessionId);
      }

      const firstPage = await listConsultationsCore(client, {
        search: uniquePrefix,
        page: 1,
        pageSize: 2,
      });
      expect(firstPage.total).toBe(3);
      expect(firstPage.items).toHaveLength(2);

      const secondPage = await listConsultationsCore(client, {
        search: uniquePrefix,
        page: 2,
        pageSize: 2,
      });
      expect(secondPage.items).toHaveLength(1);

      const allIds = [...firstPage.items, ...secondPage.items].map((item) => item.sessionId);
      for (const sessionId of sessionIds) {
        expect(allIds).toContain(sessionId);
      }
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("scopes to only the caller's own assigned sessions when called as a kader (RLS)", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const other = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const uniqueName = `UjiScopeKader-${Date.now()}`;
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: uniqueName }).eq("id", localId);

      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: other.id });
      cleanup.push(() => deleteTestSession(sessionId));

      const result = await listConsultationsCore(client, { search: uniqueName, page: 1 });
      expect(result.items).toEqual([]);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(other.id);
    }
  });

  it("excludes archived sessions by default and includes them with includeArchived", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const uniqueName = `UjiArsip-${Date.now()}`;
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: uniqueName }).eq("id", localId);

      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));
      await service
        .from("sessions")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", sessionId);

      const defaultResult = await listConsultationsCore(client, { search: uniqueName, page: 1 });
      expect(defaultResult.items).toHaveLength(0);

      const withArchived = await listConsultationsCore(client, {
        search: uniqueName,
        page: 1,
        includeArchived: true,
      });
      expect(withArchived.items).toHaveLength(1);
      expect(withArchived.items[0].archived).toBe(true);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });
});

describe("getConsultationDetailCore", () => {
  it("returns display name, assigned kader, topics, and status for any session", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: "Sahabat Detail" }).eq("id", localId);

      const kader = await createSignedInTestKader({ status: "available" });
      cleanup.push(() => deleteTestUser(kader.id));

      const sessionId = await createTestSession({
        studentLocalId: localId,
        assignedTo: kader.id,
        topics: ["bullying"],
      });
      cleanup.push(() => deleteTestSession(sessionId));
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      const detail = await getConsultationDetailCore(client, sessionId);
      expect(detail.studentDisplayName).toBe("Sahabat Detail");
      expect(detail.topics).toEqual(["bullying"]);
      expect(detail.assignedKaderName).toBeTruthy();
      expect(detail.status).toBe("active");
      expect(detail.hasTakenOver).toBe(false);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("reports hasTakenOver true once the session is assigned to this guru", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));

      const detail = await getConsultationDetailCore(client, sessionId);
      expect(detail.hasTakenOver).toBe(true);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("throws for a session id that does not exist", async () => {
    const { id, client } = await createSignedInTestGuru();
    try {
      await expect(
        getConsultationDetailCore(client, "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow("Sesi tidak ditemukan");
    } finally {
      await deleteTestUser(id);
    }
  });

  it("returns assignedKaderName null and hasTakenOver false when nobody is assigned", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      const detail = await getConsultationDetailCore(client, sessionId);
      expect(detail.assignedKaderName).toBeNull();
      expect(detail.hasTakenOver).toBe(false);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("rejects a kader reading a session assigned to a different kader (RLS)", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const owner = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: owner.id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(getConsultationDetailCore(client, sessionId)).rejects.toThrow("Sesi tidak ditemukan");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(owner.id);
    }
  });
});

describe("endConsultationAsGuruCore", () => {
  it("marks any session ended, regardless of which kader it's assigned to", async () => {
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
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      await endConsultationAsGuruCore(client, sessionId);

      const { data } = await service
        .from("sessions")
        .select("status, ended_at")
        .eq("id", sessionId)
        .single();
      expect(data?.status).toBe("ended");
      expect(data?.ended_at).toBeTruthy();
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("rejects an unverified guru via RLS", async () => {
    const { id, client } = await createSignedInTestGuru({ verified: false });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(endConsultationAsGuruCore(client, sessionId)).rejects.toThrow(
        "Gagal mengakhiri sesi, coba lagi",
      );
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });
});

describe("takeOverConsultationCore", () => {
  it("reassigns the session to the guru and logs a takeover assignment", async () => {
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
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      await takeOverConsultationCore(client, sessionId);

      const { data: session } = await service
        .from("sessions")
        .select("assigned_to")
        .eq("id", sessionId)
        .single();
      expect(session?.assigned_to).toBe(id);

      const { data: assignment } = await service
        .from("session_assignments")
        .select("from_id, to_id, changed_by, reason")
        .eq("session_id", sessionId)
        .eq("reason", "takeover")
        .single();
      expect(assignment?.from_id).toBe(kader.id);
      expect(assignment?.to_id).toBe(id);
      expect(assignment?.changed_by).toBe(id);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("throws for a session id that does not exist", async () => {
    const { id, client } = await createSignedInTestGuru();
    try {
      await expect(
        takeOverConsultationCore(client, "00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow("Sesi tidak ditemukan");
    } finally {
      await deleteTestUser(id);
    }
  });

  it("rejects an unverified guru via RLS", async () => {
    const { id, client } = await createSignedInTestGuru({ verified: false });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(takeOverConsultationCore(client, sessionId)).rejects.toThrow("Sesi tidak ditemukan");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });
});

describe("archiveSessionCore", () => {
  it("sets archived_at and hides the session from listConsultationsCore by default", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const uniqueName = `UjiHapusLog-${Date.now()}`;
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: uniqueName }).eq("id", localId);
      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await archiveSessionCore(client, sessionId);

      const { data } = await service.from("sessions").select("archived_at").eq("id", sessionId).single();
      expect(data?.archived_at).toBeTruthy();

      const listed = await listConsultationsCore(client, { search: uniqueName, page: 1 });
      expect(listed.items).toHaveLength(0);
      const listedWithArchived = await listConsultationsCore(client, {
        search: uniqueName,
        page: 1,
        includeArchived: true,
      });
      expect(listedWithArchived.items[0].archived).toBe(true);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("rejects an unverified guru via RLS", async () => {
    const { id, client } = await createSignedInTestGuru({ verified: false });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(archiveSessionCore(client, sessionId)).rejects.toThrow(
        "Gagal mengarsipkan sesi, coba lagi",
      );
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });
});
