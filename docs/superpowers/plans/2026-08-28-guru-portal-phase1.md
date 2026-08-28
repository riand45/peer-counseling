# Guru Portal Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the guru portal's placeholder dashboard with a real Beranda (stat cards, "Butuh Perhatian", "Aktivitas Terbaru"), a Daftar Konsultasi list (search/filter/pagination), a Detail Konsultasi view (live transcript, Ambil Alih Percakapan, Tandai Selesai), and a minimal Profil — so a logged-in guru can monitor and act on any student session end-to-end.

**Architecture:** New `src/lib/guru/` module split into `core.ts` (RLS-scoped query functions that take a `SupabaseClient` — testable directly against a signed-in test user, mirroring `src/lib/kader/core.ts`) and `actions.ts` (`"use server"` thin wrappers that resolve the cookie-based authenticated client and delegate to `core.ts`). New `src/components/guru/` module for the dashboard, list, and detail UI, reusing the existing `Button`/`Card`/`Chip`/`ChatBubble`/`Modal` primitives and the shared `useSessionChat` realtime transport unmodified (a guru actor already has unrestricted read/send access in `src/lib/chat/core.ts`, verified during design — no chat-layer changes needed).

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS + Realtime Broadcast), TypeScript, Tailwind v4, Vitest for integration tests against a real Supabase project (no schema changes in this plan).

**Spec:** `docs/superpowers/specs/2026-08-28-guru-portal-design.md`

## Global Constraints

- No schema/migration changes — every table, column, and RLS policy this plan uses already exists in `supabase/schema.sql`.
- All new guru-side reads/writes use the **authenticated** Supabase client (`createClient()` from `@/lib/supabase/server`) so RLS's `is_guru()` enforces authorization — never `createServiceClient()` for `profiles`/`sessions`/`messages`/`escalations`/`session_reports`/`session_assignments`. The one exception is looking up `student_identities` (no `authenticated` grant exists on that table at all), which always goes through the service client.
- Every query-bearing function in `src/lib/guru/` is split into a `..Core(supabase, ...)` function in `core.ts` (takes an explicit `SupabaseClient`, no `"use server"`, unit-testable) and a same-named wrapper in `actions.ts` (`"use server"`, resolves `createClient()`, delegates to core) — do not put query logic directly in `actions.ts`.
- Reuse existing domain types/constants — `Topic`, `TOPIC_LABELS`, `getStudentDisplayName` from `@/lib/student/types`; `SessionStatus` from `@/lib/kader/types` — do not redefine them under `src/lib/guru/`.
- All user-facing copy and thrown error messages are Bahasa Indonesia, matching the rest of the app.
- `listConsultationsCore` filters `search` in JS after fetching sessions, not via SQL `ilike` — `student_identities` (where nicknames live) has no `authenticated` grant to join against, so display names only exist in JS after the service-client lookup. This is intentional, not a shortcut to fix later.
- The Detail Konsultasi action panel's "Alihkan ke Profesional" and "Hapus Log" buttons are rendered but `disabled` in this plan — deferred to a future phase/spec, per spec §1. Do not build a Statistik screen, and do not add "Statistik" or "Laporan" nav items — both are explicitly out of scope per spec.

---

### Task 1: Guru dashboard — types, core query, action, test helper

**Files:**
- Create: `src/lib/guru/types.ts`
- Create: `src/lib/guru/core.ts`
- Create: `src/lib/guru/actions.ts`
- Modify: `tests/helpers.ts`
- Test: `tests/guru-actions.test.ts` (new)

**Interfaces:**
- Consumes: `getStudentDisplayName`, `Topic` from `@/lib/student/types`; `SessionStatus` from `@/lib/kader/types`; `createClient` from `@/lib/supabase/server`; `createServiceClient` from `@/lib/supabase/service`; `createTestUser`, `deleteTestUser`, `createTestStudentIdentity`, `deleteTestStudentIdentity`, `createTestSession`, `deleteTestSession`, `signInTestUser`, `getServiceClient`, `createSignedInTestKader` from `./helpers`.
- Produces: `ConsultationCounts`, `AttentionItem`, `ActivityItem`, `GuruDashboard`, `SESSION_STATUS_LABELS`, `SESSION_STATUS_TONES` types/consts from `@/lib/guru/types` (the labels/tones maps are the single source of truth reused by every guru UI component in later tasks — do not redefine them per-component); `getGuruDashboardCore(supabase: SupabaseClient): Promise<GuruDashboard>` from `@/lib/guru/core`; `getGuruDashboard(): Promise<GuruDashboard>` from `@/lib/guru/actions`; `createSignedInTestGuru(opts?: { verified?: boolean }): Promise<{ id: string; client: SupabaseClient }>` from `./helpers` (used by this and every later guru test task).

- [ ] **Step 1: Add the signed-in-guru test helper**

Add to `tests/helpers.ts` (near `createSignedInTestKader`):

```typescript
export async function createSignedInTestGuru(
  opts: { verified?: boolean } = {},
): Promise<{ id: string; client: SupabaseClient }> {
  const user = await createTestUser("guru", { verified: opts.verified ?? true });
  const { client } = await signInTestUser(user.email, user.password);
  return { id: user.id, client };
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/guru-actions.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: FAIL — `@/lib/guru/core` does not exist yet, and `createSignedInTestGuru` is not exported from `./helpers` yet (it is, from Step 1 — the failure here is purely the missing module).

- [ ] **Step 4: Implement the types**

Create `src/lib/guru/types.ts`:

```typescript
import type { SessionStatus } from "@/lib/kader/types";
import type { Topic } from "@/lib/student/types";

export type ConsultationCounts = {
  total: number;
  active: number;
  waiting: number;
  ended: number;
};

export type AttentionItem = {
  sessionId: string;
  kind: "escalation" | "report";
  studentDisplayName: string;
  detail: string;
  createdAt: string;
};

export type ActivityItem = {
  sessionId: string;
  studentDisplayName: string;
  topics: Topic[];
  assignedKaderName: string | null;
  status: SessionStatus;
  lastMessageAt: string | null;
};

export type GuruDashboard = {
  fullName: string;
  counts: ConsultationCounts;
  attention: AttentionItem[];
  activity: ActivityItem[];
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  waiting: "Menunggu",
  active: "Berlangsung",
  escalated: "Eskalasi",
  ended: "Selesai",
};

export const SESSION_STATUS_TONES: Record<SessionStatus, "primary" | "error" | "neutral"> = {
  waiting: "neutral",
  active: "primary",
  escalated: "error",
  ended: "neutral",
};
```

- [ ] **Step 5: Implement the core function**

Create `src/lib/guru/core.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getStudentDisplayName } from "@/lib/student/types";
import type { Topic } from "@/lib/student/types";
import type { SessionStatus } from "@/lib/kader/types";
import type { ActivityItem, AttentionItem, ConsultationCounts, GuruDashboard } from "./types";

const ACTIVITY_LIMIT = 10;
const ATTENTION_LIMIT = 20;

export async function getGuruDashboardCore(supabase: SupabaseClient): Promise<GuruDashboard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("Gagal memuat profil");
  }

  const { data: statusRows, error: statusError } = await supabase.from("sessions").select("status");

  if (statusError) {
    throw new Error("Gagal memuat ringkasan konsultasi");
  }

  const counts: ConsultationCounts = { total: 0, active: 0, waiting: 0, ended: 0 };
  for (const row of statusRows ?? []) {
    counts.total += 1;
    const status = row.status as SessionStatus;
    if (status === "active") counts.active += 1;
    else if (status === "waiting") counts.waiting += 1;
    else if (status === "ended") counts.ended += 1;
  }

  const [{ data: escalations, error: escalationsError }, { data: reports, error: reportsError }] =
    await Promise.all([
      supabase
        .from("escalations")
        .select("session_id, reason, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(ATTENTION_LIMIT),
      supabase
        .from("session_reports")
        .select("session_id, details, created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(ATTENTION_LIMIT),
    ]);

  if (escalationsError || reportsError) {
    throw new Error("Gagal memuat daftar butuh perhatian");
  }

  const attentionSource = [
    ...(escalations ?? []).map((row) => ({
      sessionId: row.session_id as string,
      kind: "escalation" as const,
      detail: (row.reason as string | null) ?? "Eskalasi tanpa keterangan",
      createdAt: row.created_at as string,
    })),
    ...(reports ?? []).map((row) => ({
      sessionId: row.session_id as string,
      kind: "report" as const,
      detail: (row.details as string | null) ?? "Tidak ada detail tambahan",
      createdAt: row.created_at as string,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const { data: activityRows, error: activityError } = await supabase
    .from("sessions")
    .select("id, topics, status, student_local_id, assigned_to, last_message_at")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(ACTIVITY_LIMIT);

  if (activityError) {
    throw new Error("Gagal memuat aktivitas terbaru");
  }

  const activityRowList = activityRows ?? [];

  const sessionInfoById = new Map<string, { student_local_id: string; assigned_to: string | null }>();
  for (const row of activityRowList) {
    sessionInfoById.set(row.id as string, {
      student_local_id: row.student_local_id as string,
      assigned_to: row.assigned_to as string | null,
    });
  }

  // Attention items only carry session_id — resolve student_local_id for any
  // attention session the activity query above didn't already cover.
  const missingSessionIds = [...new Set(attentionSource.map((item) => item.sessionId))].filter(
    (sessionId) => !sessionInfoById.has(sessionId),
  );
  if (missingSessionIds.length > 0) {
    const { data: attentionSessions } = await supabase
      .from("sessions")
      .select("id, student_local_id, assigned_to")
      .in("id", missingSessionIds);
    for (const row of attentionSessions ?? []) {
      sessionInfoById.set(row.id as string, {
        student_local_id: row.student_local_id as string,
        assigned_to: row.assigned_to as string | null,
      });
    }
  }

  const studentLocalIds = [...new Set([...sessionInfoById.values()].map((info) => info.student_local_id))];
  const identityById = new Map<string, { nickname: string | null; avatar_seed: string | null }>();
  if (studentLocalIds.length > 0) {
    const service = createServiceClient();
    const { data: identities } = await service
      .from("student_identities")
      .select("id, nickname, avatar_seed")
      .in("id", studentLocalIds);
    for (const identity of identities ?? []) {
      identityById.set(identity.id as string, {
        nickname: identity.nickname as string | null,
        avatar_seed: identity.avatar_seed as string | null,
      });
    }
  }

  const kaderIds = [
    ...new Set(
      [...sessionInfoById.values()]
        .map((info) => info.assigned_to)
        .filter((kaderId): kaderId is string => Boolean(kaderId)),
    ),
  ];
  const kaderNameById = new Map<string, string>();
  if (kaderIds.length > 0) {
    const { data: kaderProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", kaderIds);
    for (const row of kaderProfiles ?? []) {
      kaderNameById.set(row.id as string, (row.full_name as string | null) ?? "Kader");
    }
  }

  function displayNameForSession(sessionId: string): string {
    const info = sessionInfoById.get(sessionId);
    const identity = info ? identityById.get(info.student_local_id) : undefined;
    return getStudentDisplayName(identity?.nickname, identity?.avatar_seed);
  }

  const attention: AttentionItem[] = attentionSource.map((item) => ({
    sessionId: item.sessionId,
    kind: item.kind,
    studentDisplayName: displayNameForSession(item.sessionId),
    detail: item.detail,
    createdAt: item.createdAt,
  }));

  const activity: ActivityItem[] = activityRowList.map((row) => {
    const info = sessionInfoById.get(row.id as string);
    return {
      sessionId: row.id as string,
      studentDisplayName: displayNameForSession(row.id as string),
      topics: (row.topics as Topic[]) ?? [],
      assignedKaderName: info?.assigned_to ? kaderNameById.get(info.assigned_to) ?? null : null,
      status: row.status as SessionStatus,
      lastMessageAt: (row.last_message_at as string | null) ?? null,
    };
  });

  return {
    fullName: (profile.full_name as string | null) ?? "Guru BK",
    counts,
    attention,
    activity,
  };
}
```

- [ ] **Step 6: Implement the action wrapper**

Create `src/lib/guru/actions.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { getGuruDashboardCore } from "./core";
import type { GuruDashboard } from "./types";

export async function getGuruDashboard(): Promise<GuruDashboard> {
  const supabase = await createClient();
  return getGuruDashboardCore(supabase);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/guru/types.ts src/lib/guru/core.ts src/lib/guru/actions.ts tests/helpers.ts tests/guru-actions.test.ts
git commit -m "feat(guru): add guru dashboard query (counts, attention, activity)"
```

---

### Task 2: List consultations — types, core, action, tests

**Files:**
- Modify: `src/lib/guru/types.ts`
- Modify: `src/lib/guru/core.ts`
- Modify: `src/lib/guru/actions.ts`
- Modify: `tests/guru-actions.test.ts`

**Interfaces:**
- Consumes: `createSignedInTestGuru`, `createSignedInTestKader`, `getServiceClient`, `createTestStudentIdentity`, `deleteTestStudentIdentity`, `createTestSession`, `deleteTestSession`, `deleteTestUser` (Task 1) from `./helpers`.
- Produces: `ConsultationListItem`, `ConsultationListResult` types from `@/lib/guru/types`; `listConsultationsCore(supabase: SupabaseClient, input: { status?: SessionStatus; search?: string; page: number; pageSize?: number }): Promise<ConsultationListResult>` from `@/lib/guru/core`; `listConsultations(input: { status?: SessionStatus; search?: string; page: number }): Promise<ConsultationListResult>` from `@/lib/guru/actions`. Task 10/11 (Daftar Konsultasi UI) consume the action.

- [ ] **Step 1: Write the failing test**

Add to `tests/guru-actions.test.ts`:

```typescript
import { listConsultationsCore } from "@/lib/guru/core";

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
});
```

(Add the `import { listConsultationsCore } from "@/lib/guru/core";` line alongside the existing `getGuruDashboardCore` import at the top of the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/guru-actions.test.ts -t listConsultationsCore`
Expected: FAIL — `listConsultationsCore` is not exported from `@/lib/guru/core`.

- [ ] **Step 3: Add the types**

Append to `src/lib/guru/types.ts`:

```typescript
export type ConsultationListItem = {
  sessionId: string;
  studentDisplayName: string;
  topics: Topic[];
  assignedKaderName: string | null;
  status: SessionStatus;
  createdAt: string;
};

export type ConsultationListResult = {
  items: ConsultationListItem[];
  total: number;
  page: number;
  pageSize: number;
};
```

- [ ] **Step 4: Implement the core function**

Append to `src/lib/guru/core.ts`:

```typescript
import type { ConsultationListItem, ConsultationListResult } from "./types";

const DEFAULT_PAGE_SIZE = 10;

export async function listConsultationsCore(
  supabase: SupabaseClient,
  input: { status?: SessionStatus; search?: string; page: number; pageSize?: number },
): Promise<ConsultationListResult> {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;

  let query = supabase
    .from("sessions")
    .select("id, topics, status, student_local_id, assigned_to, created_at")
    .order("created_at", { ascending: false });

  if (input.status) {
    query = query.eq("status", input.status);
  }

  const { data: sessions, error } = await query;
  if (error) {
    throw new Error("Gagal memuat daftar konsultasi");
  }

  const sessionRows = sessions ?? [];

  const studentLocalIds = [...new Set(sessionRows.map((row) => row.student_local_id as string))];
  const identityById = new Map<string, { nickname: string | null; avatar_seed: string | null }>();
  if (studentLocalIds.length > 0) {
    const service = createServiceClient();
    const { data: identities } = await service
      .from("student_identities")
      .select("id, nickname, avatar_seed")
      .in("id", studentLocalIds);
    for (const identity of identities ?? []) {
      identityById.set(identity.id as string, {
        nickname: identity.nickname as string | null,
        avatar_seed: identity.avatar_seed as string | null,
      });
    }
  }

  const kaderIds = [
    ...new Set(
      sessionRows
        .map((row) => row.assigned_to as string | null)
        .filter((kaderId): kaderId is string => Boolean(kaderId)),
    ),
  ];
  const kaderNameById = new Map<string, string>();
  if (kaderIds.length > 0) {
    const { data: kaderProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", kaderIds);
    for (const row of kaderProfiles ?? []) {
      kaderNameById.set(row.id as string, (row.full_name as string | null) ?? "Kader");
    }
  }

  const allItems: ConsultationListItem[] = sessionRows.map((row) => {
    const identity = identityById.get(row.student_local_id as string);
    const assignedTo = row.assigned_to as string | null;
    return {
      sessionId: row.id as string,
      studentDisplayName: getStudentDisplayName(identity?.nickname, identity?.avatar_seed),
      topics: (row.topics as Topic[]) ?? [],
      assignedKaderName: assignedTo ? kaderNameById.get(assignedTo) ?? null : null,
      status: row.status as SessionStatus,
      createdAt: row.created_at as string,
    };
  });

  const search = input.search?.trim().toLowerCase();
  const filtered = search
    ? allItems.filter(
        (item) =>
          item.sessionId.toLowerCase().includes(search) ||
          item.studentDisplayName.toLowerCase().includes(search),
      )
    : allItems;

  const page = Math.max(1, input.page);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total: filtered.length, page, pageSize };
}
```

(Merge the `import type { ConsultationListItem, ConsultationListResult } from "./types";` into the existing `import type { ActivityItem, AttentionItem, ConsultationCounts, GuruDashboard } from "./types";` line, making it one combined import from `"./types"`.)

- [ ] **Step 5: Implement the action wrapper**

Append to `src/lib/guru/actions.ts`:

```typescript
import { listConsultationsCore } from "./core";
import type { SessionStatus } from "@/lib/kader/types";
import type { ConsultationListResult } from "./types";

export async function listConsultations(input: {
  status?: SessionStatus;
  search?: string;
  page: number;
}): Promise<ConsultationListResult> {
  const supabase = await createClient();
  return listConsultationsCore(supabase, input);
}
```

(Merge `listConsultationsCore` into the existing `import { getGuruDashboardCore } from "./core";` line, and merge the type import into whatever `import type { ... } from "./types";` line already exists in `actions.ts` — if none exists yet, add this one.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: PASS (all tests so far).

- [ ] **Step 7: Commit**

```bash
git add src/lib/guru/types.ts src/lib/guru/core.ts src/lib/guru/actions.ts tests/guru-actions.test.ts
git commit -m "feat(guru): add listConsultations query (search, status filter, pagination)"
```

---

### Task 3: Consultation detail — types, core, action, tests

**Files:**
- Modify: `src/lib/guru/types.ts`
- Modify: `src/lib/guru/core.ts`
- Modify: `src/lib/guru/actions.ts`
- Modify: `tests/guru-actions.test.ts`

**Interfaces:**
- Consumes: same test helpers as Task 2.
- Produces: `ConsultationDetail` type from `@/lib/guru/types`; `getConsultationDetailCore(supabase: SupabaseClient, sessionId: string): Promise<ConsultationDetail>` from `@/lib/guru/core`; `getConsultationDetail(input: { sessionId: string }): Promise<ConsultationDetail>` from `@/lib/guru/actions`. Task 12 (Detail Konsultasi screen) consumes the action. `ConsultationDetail.hasTakenOver` (true when `sessions.assigned_to` already equals the current guru) is what later drives the screen's read-only-vs-input-box toggle.

- [ ] **Step 1: Write the failing test**

Add to `tests/guru-actions.test.ts`:

```typescript
import { getConsultationDetailCore } from "@/lib/guru/core";

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
});
```

(Add the `import { getConsultationDetailCore } from "@/lib/guru/core";` line alongside the other core imports at the top of the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/guru-actions.test.ts -t getConsultationDetailCore`
Expected: FAIL — `getConsultationDetailCore` is not exported from `@/lib/guru/core`.

- [ ] **Step 3: Add the types**

Append to `src/lib/guru/types.ts`:

```typescript
export type ConsultationDetail = {
  sessionId: string;
  studentDisplayName: string;
  assignedKaderName: string | null;
  hasTakenOver: boolean;
  topics: Topic[];
  status: SessionStatus;
  createdAt: string;
};
```

- [ ] **Step 4: Implement the core function**

Append to `src/lib/guru/core.ts`:

```typescript
import type { ConsultationDetail } from "./types";

export async function getConsultationDetailCore(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<ConsultationDetail> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, topics, status, student_local_id, assigned_to, created_at")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    throw new Error("Sesi tidak ditemukan");
  }

  const service = createServiceClient();
  const { data: identity } = await service
    .from("student_identities")
    .select("nickname, avatar_seed")
    .eq("id", session.student_local_id as string)
    .single();

  const assignedTo = session.assigned_to as string | null;
  let assignedKaderName: string | null = null;
  if (assignedTo) {
    const { data: kaderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", assignedTo)
      .single();
    assignedKaderName = (kaderProfile?.full_name as string | null) ?? null;
  }

  return {
    sessionId: session.id as string,
    studentDisplayName: getStudentDisplayName(
      identity?.nickname as string | null | undefined,
      identity?.avatar_seed as string | null | undefined,
    ),
    assignedKaderName,
    hasTakenOver: assignedTo === user.id,
    topics: (session.topics as Topic[]) ?? [],
    status: session.status as SessionStatus,
    createdAt: session.created_at as string,
  };
}
```

(Merge the `import type { ConsultationDetail } from "./types";` into the existing combined type import line in `core.ts`.)

- [ ] **Step 5: Implement the action wrapper**

Append to `src/lib/guru/actions.ts`:

```typescript
import { getConsultationDetailCore } from "./core";
import type { ConsultationDetail } from "./types";

export async function getConsultationDetail(input: { sessionId: string }): Promise<ConsultationDetail> {
  const supabase = await createClient();
  return getConsultationDetailCore(supabase, input.sessionId);
}
```

(Merge into the existing core-import and type-import lines rather than duplicating them.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/guru/types.ts src/lib/guru/core.ts src/lib/guru/actions.ts tests/guru-actions.test.ts
git commit -m "feat(guru): add getConsultationDetail for the Detail Konsultasi screen"
```

---

### Task 4: End consultation as guru — core, action, tests

**Files:**
- Modify: `src/lib/guru/core.ts`
- Modify: `src/lib/guru/actions.ts`
- Modify: `tests/guru-actions.test.ts`

**Interfaces:**
- Consumes: same test helpers as Task 2, plus `createSignedInTestGuru({ verified: false })`.
- Produces: `endConsultationAsGuruCore(supabase: SupabaseClient, sessionId: string): Promise<void>` from `@/lib/guru/core`; `endConsultationAsGuru(input: { sessionId: string }): Promise<void>` from `@/lib/guru/actions`. Task 12 consumes the action.

- [ ] **Step 1: Write the failing test**

Add to `tests/guru-actions.test.ts`:

```typescript
import { endConsultationAsGuruCore } from "@/lib/guru/core";

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
```

(Add the `import { endConsultationAsGuruCore } from "@/lib/guru/core";` line alongside the other core imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/guru-actions.test.ts -t endConsultationAsGuruCore`
Expected: FAIL — `endConsultationAsGuruCore` is not exported from `@/lib/guru/core`.

- [ ] **Step 3: Implement**

Append to `src/lib/guru/core.ts`:

```typescript
export async function endConsultationAsGuruCore(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { data, error } = await supabase
    .from("sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Gagal mengakhiri sesi, coba lagi");
  }
}
```

Append to `src/lib/guru/actions.ts`:

```typescript
import { endConsultationAsGuruCore } from "./core";
import { revalidatePath } from "next/cache";

export async function endConsultationAsGuru(input: { sessionId: string }): Promise<void> {
  const supabase = await createClient();
  await endConsultationAsGuruCore(supabase, input.sessionId);
  revalidatePath("/guru");
  revalidatePath("/guru/konsultasi");
  revalidatePath(`/guru/konsultasi/${input.sessionId}`);
}
```

(Merge `endConsultationAsGuruCore` into the existing core-import line, and add the single `import { revalidatePath } from "next/cache";` line near the top of `actions.ts` alongside the existing imports — don't duplicate it if a later task also needs it.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add src/lib/guru/core.ts src/lib/guru/actions.ts tests/guru-actions.test.ts
git commit -m "feat(guru): add endConsultationAsGuru server action"
```

---

### Task 5: Take over consultation — core, action, tests

**Files:**
- Modify: `src/lib/guru/core.ts`
- Modify: `src/lib/guru/actions.ts`
- Modify: `tests/guru-actions.test.ts`

**Interfaces:**
- Consumes: same test helpers as Task 2.
- Produces: `takeOverConsultationCore(supabase: SupabaseClient, sessionId: string): Promise<void>` from `@/lib/guru/core`; `takeOverConsultation(input: { sessionId: string }): Promise<void>` from `@/lib/guru/actions`. Task 12 consumes the action.

- [ ] **Step 1: Write the failing test**

Add to `tests/guru-actions.test.ts`:

```typescript
import { takeOverConsultationCore } from "@/lib/guru/core";

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
});
```

(Add the `import { takeOverConsultationCore } from "@/lib/guru/core";` line alongside the other core imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/guru-actions.test.ts -t takeOverConsultationCore`
Expected: FAIL — `takeOverConsultationCore` is not exported from `@/lib/guru/core`.

- [ ] **Step 3: Implement**

Append to `src/lib/guru/core.ts`:

```typescript
export async function takeOverConsultationCore(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("assigned_to")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error("Sesi tidak ditemukan");
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update({ assigned_to: user.id })
    .eq("id", sessionId);

  if (updateError) {
    throw new Error("Gagal mengambil alih percakapan");
  }

  const { error: assignmentError } = await supabase.from("session_assignments").insert({
    session_id: sessionId,
    from_id: session.assigned_to,
    to_id: user.id,
    changed_by: user.id,
    reason: "takeover",
  });

  if (assignmentError) {
    throw new Error("Gagal mencatat pengambilalihan");
  }
}
```

Append to `src/lib/guru/actions.ts`:

```typescript
import { takeOverConsultationCore } from "./core";

export async function takeOverConsultation(input: { sessionId: string }): Promise<void> {
  const supabase = await createClient();
  await takeOverConsultationCore(supabase, input.sessionId);
  revalidatePath(`/guru/konsultasi/${input.sessionId}`);
}
```

(Merge `takeOverConsultationCore` into the existing core-import line.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in `tests/chat.test.ts`, `tests/kader-actions.test.ts`, `tests/student-actions.test.ts`, `tests/student-types.test.ts`, `tests/schema.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/guru/core.ts src/lib/guru/actions.ts tests/guru-actions.test.ts
git commit -m "feat(guru): add takeOverConsultation server action"
```

---

### Task 6: StatCard component

**Files:**
- Create: `src/components/guru/StatCard.tsx`

**Interfaces:**
- Consumes: `Card` from `@/components/ui/Card`.
- Produces: `StatCard({ icon: ReactNode, label: string, value: string | number })`. Consumed by Task 9 (DashboardScreen).

- [ ] **Step 1: Implement**

Create `src/components/guru/StatCard.tsx`:

```tsx
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <Card className="flex flex-col gap-3">
      <div
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container text-lg text-on-secondary-container"
      >
        {icon}
      </div>
      <div>
        <p className="text-label-md text-on-surface-variant">{label}</p>
        <p className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">{value}</p>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/components/guru/StatCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/guru/StatCard.tsx
git commit -m "feat(guru): add StatCard component"
```

---

### Task 7: AttentionPanel component

**Files:**
- Create: `src/components/guru/AttentionPanel.tsx`

**Interfaces:**
- Consumes: `AttentionItem` (Task 1) from `@/lib/guru/types`; `Card`, `Chip` from `@/components/ui/*`.
- Produces: `AttentionPanel({ items: AttentionItem[] })`. Consumed by Task 9 (DashboardScreen).

- [ ] **Step 1: Implement**

Create `src/components/guru/AttentionPanel.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import type { AttentionItem } from "@/lib/guru/types";

function formatRelativeTime(iso: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return "Baru saja";
  if (diffMinutes < 60) return `${diffMinutes} mnt lalu`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} hari lalu`;
}

export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-headline-md text-on-surface">⚠️ Butuh Perhatian</h2>
        <Chip tone="error">{items.length} Kasus</Chip>
      </div>
      {items.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">Tidak ada kasus yang butuh perhatian saat ini.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={`${item.kind}-${item.sessionId}-${item.createdAt}`}>
              <Link
                href={`/guru/konsultasi/${item.sessionId}`}
                className="block rounded-md border-l-4 border-error bg-error-container/40 p-3 transition-colors hover:bg-error-container/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-label-md font-semibold text-on-surface">{item.studentDisplayName}</p>
                  <Chip tone="error">{item.kind === "escalation" ? "Eskalasi" : "Laporan User"}</Chip>
                </div>
                <p className="mt-1 line-clamp-2 text-body-md text-on-surface-variant">{item.detail}</p>
                <p className="mt-1 text-label-sm text-on-surface-variant">
                  🕐 {formatRelativeTime(item.createdAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/components/guru/AttentionPanel.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/guru/AttentionPanel.tsx
git commit -m "feat(guru): add AttentionPanel component"
```

---

### Task 8: ActivityTable component

**Files:**
- Create: `src/components/guru/ActivityTable.tsx`

**Interfaces:**
- Consumes: `ActivityItem`, `SESSION_STATUS_LABELS`, `SESSION_STATUS_TONES` (Task 1) from `@/lib/guru/types`; `Chip` from `@/components/ui/Chip`; `TOPIC_LABELS` from `@/lib/student/types`.
- Produces: `ActivityTable({ items: ActivityItem[] })`. Consumed by Task 9 (DashboardScreen).

- [ ] **Step 1: Implement**

Create `src/components/guru/ActivityTable.tsx`:

```tsx
import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { TOPIC_LABELS } from "@/lib/student/types";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/guru/types";
import type { ActivityItem } from "@/lib/guru/types";

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "-";
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return "Baru saja";
  if (diffMinutes < 60) return `${diffMinutes} mnt lalu`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} hari lalu`;
}

export function ActivityTable({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-body-md text-on-surface-variant">Belum ada aktivitas konsultasi.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-body-md">
        <thead>
          <tr className="border-b border-outline-variant text-label-sm text-on-surface-variant">
            <th className="py-2 pr-3 font-medium">Anonim</th>
            <th className="py-2 pr-3 font-medium">Topik</th>
            <th className="py-2 pr-3 font-medium">Kader</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Terakhir Aktif</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.sessionId} className="border-b border-outline-variant last:border-0">
              <td className="py-3 pr-3">
                <Link href={`/guru/konsultasi/${item.sessionId}`} className="font-semibold text-primary">
                  {item.studentDisplayName}
                </Link>
              </td>
              <td className="py-3 pr-3">{item.topics[0] ? TOPIC_LABELS[item.topics[0]] : "-"}</td>
              <td className="py-3 pr-3">{item.assignedKaderName ?? "- Belum Ditugaskan -"}</td>
              <td className="py-3 pr-3">
                <Chip tone={SESSION_STATUS_TONES[item.status]}>{SESSION_STATUS_LABELS[item.status]}</Chip>
              </td>
              <td className="py-3 pr-3 text-on-surface-variant">{formatRelativeTime(item.lastMessageAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/components/guru/ActivityTable.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/guru/ActivityTable.tsx
git commit -m "feat(guru): add ActivityTable component"
```

---

### Task 9: DashboardScreen — wire Beranda together

**Files:**
- Create: `src/components/guru/DashboardScreen.tsx`
- Modify: `src/app/guru/(protected)/page.tsx`

**Interfaces:**
- Consumes: `getGuruDashboard` (Task 1) from `@/lib/guru/actions`; `GuruDashboard` from `@/lib/guru/types`; `StatCard` (Task 6); `AttentionPanel` (Task 7); `ActivityTable` (Task 8).
- Produces: `DashboardScreen()` — self-fetching client component, default export target for the rewritten `/guru` page.

- [ ] **Step 1: Implement the screen**

Create `src/components/guru/DashboardScreen.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getGuruDashboard } from "@/lib/guru/actions";
import type { GuruDashboard } from "@/lib/guru/types";
import { StatCard } from "./StatCard";
import { AttentionPanel } from "./AttentionPanel";
import { ActivityTable } from "./ActivityTable";

export function DashboardScreen() {
  const [dashboard, setDashboard] = useState<GuruDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGuruDashboard()
      .then(setDashboard)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat dashboard"));
  }, []);

  if (error) {
    return (
      <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
        {error}
      </p>
    );
  }

  if (!dashboard) {
    return <p className="text-body-md text-on-surface-variant">Memuat dashboard...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
          Dashboard Guru/BK
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Selamat datang, Pak/Bu {dashboard.fullName}. Berikut ringkasan hari ini.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="💬" label="Total Konsultasi" value={dashboard.counts.total} />
        <StatCard icon="🔄" label="Sedang Berlangsung" value={dashboard.counts.active} />
        <StatCard icon="⏳" label="Menunggu" value={dashboard.counts.waiting} />
        <StatCard icon="✅" label="Selesai" value={dashboard.counts.ended} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        <AttentionPanel items={dashboard.attention} />
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-md">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-headline-md text-on-surface">Aktivitas Terbaru</h2>
            <Link href="/guru/konsultasi" className="text-label-md font-semibold text-primary">
              Lihat Semua
            </Link>
          </div>
          <ActivityTable items={dashboard.activity} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the Beranda page**

Replace the full contents of `src/app/guru/(protected)/page.tsx`:

```tsx
import { DashboardScreen } from "@/components/guru/DashboardScreen";

export default function GuruHomePage() {
  return <DashboardScreen />;
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`, log in as a verified guru at `/guru/login`, and confirm `/guru` renders the greeting, 4 stat cards, "Butuh Perhatian" (empty state if nothing pending), and "Aktivitas Terbaru" (empty state if no sessions exist yet).

- [ ] **Step 5: Commit**

```bash
git add src/components/guru/DashboardScreen.tsx "src/app/guru/(protected)/page.tsx"
git commit -m "feat(guru): wire up the Beranda dashboard screen"
```

---

### Task 10: ConsultationTable component

**Files:**
- Create: `src/components/guru/ConsultationTable.tsx`

**Interfaces:**
- Consumes: `ConsultationListItem`, `ConsultationListResult`, `SESSION_STATUS_LABELS`, `SESSION_STATUS_TONES` (Tasks 1-2) from `@/lib/guru/types`; `Chip` from `@/components/ui/Chip`; `TOPIC_LABELS` from `@/lib/student/types`.
- Produces: `ConsultationTable({ result: ConsultationListResult, onPageChange: (page: number) => void })`. Consumed by Task 11 (ConsultationListScreen).

- [ ] **Step 1: Implement**

Create `src/components/guru/ConsultationTable.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { TOPIC_LABELS } from "@/lib/student/types";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/guru/types";
import type { ConsultationListItem, ConsultationListResult } from "@/lib/guru/types";

const ACTION_LABELS: Record<ConsultationListItem["status"], string> = {
  waiting: "Tinjau",
  active: "Pantau",
  escalated: "Tinjau",
  ended: "Riwayat",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConsultationTable({
  result,
  onPageChange,
}: {
  result: ConsultationListResult;
  onPageChange: (page: number) => void;
}) {
  const { items, total, page, pageSize } = result;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = end < total;

  if (items.length === 0) {
    return <p className="text-body-md text-on-surface-variant">Tidak ada sesi konsultasi yang cocok.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-body-md">
          <thead>
            <tr className="border-b border-outline-variant text-label-sm text-on-surface-variant">
              <th className="py-2 pr-3 font-medium">ID Sesi</th>
              <th className="py-2 pr-3 font-medium">Siswa (Anonim)</th>
              <th className="py-2 pr-3 font-medium">Topik</th>
              <th className="py-2 pr-3 font-medium">Kader Bertugas</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Tanggal</th>
              <th className="py-2 pr-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sessionId} className="border-b border-outline-variant last:border-0">
                <td className="py-3 pr-3 font-mono text-label-sm text-primary">
                  #{item.sessionId.slice(0, 8)}
                </td>
                <td className="py-3 pr-3 font-semibold text-on-surface">{item.studentDisplayName}</td>
                <td className="py-3 pr-3">{item.topics[0] ? TOPIC_LABELS[item.topics[0]] : "-"}</td>
                <td className="py-3 pr-3">{item.assignedKaderName ?? "- Belum Ditugaskan -"}</td>
                <td className="py-3 pr-3">
                  <Chip tone={SESSION_STATUS_TONES[item.status]}>{SESSION_STATUS_LABELS[item.status]}</Chip>
                </td>
                <td className="py-3 pr-3 text-on-surface-variant">{formatDate(item.createdAt)}</td>
                <td className="py-3 pr-3">
                  <Link
                    href={`/guru/konsultasi/${item.sessionId}`}
                    className="inline-flex items-center justify-center rounded-md border border-outline-variant px-4 py-2 text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-variant"
                  >
                    {ACTION_LABELS[item.status]}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-label-sm text-on-surface-variant">
        <p>
          Menampilkan {start}-{end} dari {total} Sesi
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={!hasPrev} onClick={() => onPageChange(page - 1)}>
            ←
          </Button>
          <Button variant="ghost" disabled={!hasNext} onClick={() => onPageChange(page + 1)}>
            →
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/components/guru/ConsultationTable.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/guru/ConsultationTable.tsx
git commit -m "feat(guru): add ConsultationTable component"
```

---

### Task 11: ConsultationListScreen — wire Daftar Konsultasi together

**Files:**
- Create: `src/components/guru/ConsultationListScreen.tsx`
- Create: `src/app/guru/(protected)/konsultasi/page.tsx`

**Interfaces:**
- Consumes: `listConsultations` (Task 2) from `@/lib/guru/actions`; `SessionStatus` from `@/lib/kader/types`; `ConsultationListResult` from `@/lib/guru/types`; `ConsultationTable` (Task 10); `cn` from `@/lib/cn`.
- Produces: `ConsultationListScreen()` — self-fetching client component; the `/guru/konsultasi` route.

- [ ] **Step 1: Implement the screen**

Create `src/components/guru/ConsultationListScreen.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { listConsultations } from "@/lib/guru/actions";
import type { SessionStatus } from "@/lib/kader/types";
import type { ConsultationListResult } from "@/lib/guru/types";
import { ConsultationTable } from "./ConsultationTable";

const STATUS_TABS: { value: SessionStatus | "all"; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "waiting", label: "Menunggu" },
  { value: "active", label: "Berlangsung" },
  { value: "ended", label: "Selesai" },
];

export function ConsultationListScreen() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SessionStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ConsultationListResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listConsultations({ status: status === "all" ? undefined : status, search, page })
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Gagal memuat daftar konsultasi");
      });
    return () => {
      active = false;
    };
  }, [search, status, page]);

  function handleStatusChange(next: SessionStatus | "all") {
    setStatus(next);
    setPage(1);
  }

  function handleSearchChange(next: string) {
    setSearch(next);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
          Manajemen Konsultasi
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Pantau dan kelola seluruh sesi konsultasi siswa.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-md md:flex-row md:items-center md:justify-between">
        <input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Cari ID Sesi atau Nama Samaran..."
          className="w-full rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest md:max-w-sm"
        />
        <div className="inline-flex flex-wrap gap-1 rounded-full border border-outline-variant bg-surface-container-low p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleStatusChange(tab.value)}
              className={cn(
                "rounded-full px-4 py-2 text-label-md font-semibold transition-colors",
                status === tab.value
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-variant",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      {!result && !error ? (
        <p className="text-body-md text-on-surface-variant">Memuat daftar konsultasi...</p>
      ) : (
        result && <ConsultationTable result={result} onPageChange={setPage} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

Create `src/app/guru/(protected)/konsultasi/page.tsx`:

```tsx
import { ConsultationListScreen } from "@/components/guru/ConsultationListScreen";

export default function GuruConsultationListPage() {
  return <ConsultationListScreen />;
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`, log in as a verified guru, navigate to `/guru/konsultasi`. Confirm the search box and 4 status tabs render, and either the empty state or a table appears. Create a couple of test sessions via the Supabase dashboard with different statuses (`sessions` table: any `student_local_id`, any `status`), refresh, and confirm they show up with the right topic/kader/status, and that clicking a status tab filters the table and clicking a search term narrows it.

- [ ] **Step 5: Commit**

```bash
git add src/components/guru/ConsultationListScreen.tsx "src/app/guru/(protected)/konsultasi/page.tsx"
git commit -m "feat(guru): add Daftar Konsultasi list screen and route"
```

---

### Task 12: ConsultationDetailScreen — wire Detail Konsultasi together

**Files:**
- Create: `src/components/guru/ConsultationDetailScreen.tsx`
- Create: `src/app/guru/(protected)/konsultasi/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `useSessionChat` (existing, unmodified) from `@/lib/chat/useSessionChat`; `getConsultationDetail` (Task 3), `endConsultationAsGuru` (Task 4), `takeOverConsultation` (Task 5) from `@/lib/guru/actions`; `ConsultationDetail`, `SESSION_STATUS_LABELS`, `SESSION_STATUS_TONES` from `@/lib/guru/types`; `Button`, `Card`, `Chip`, `ChatBubble`, `Modal` from `@/components/ui/*`; `TOPIC_LABELS` from `@/lib/student/types`.
- Produces: `ConsultationDetailScreen({ sessionId: string })`; the `/guru/konsultasi/[sessionId]` route. Unlike the kader/student chat screens, this route stays **inside** the `(protected)` group — the mockup keeps the sidebar visible here, and the layout's existing auth/role/verification gate already covers it, so the page component itself needs no extra auth check.

- [ ] **Step 1: Implement the screen**

Create `src/components/guru/ConsultationDetailScreen.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { Modal } from "@/components/ui/Modal";
import { useSessionChat } from "@/lib/chat/useSessionChat";
import {
  endConsultationAsGuru,
  getConsultationDetail,
  takeOverConsultation,
} from "@/lib/guru/actions";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/guru/types";
import { TOPIC_LABELS } from "@/lib/student/types";
import type { ConsultationDetail } from "@/lib/guru/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function StudentAvatar({ displayName }: { displayName?: string }) {
  const initial = displayName?.trim().charAt(0).toUpperCase() || "A";
  return (
    <div
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-sm font-bold text-on-secondary-container"
    >
      {initial}
    </div>
  );
}

export function ConsultationDetailScreen({ sessionId }: { sessionId: string }) {
  const [detail, setDetail] = useState<ConsultationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingTakeOver, setConfirmingTakeOver] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [ending, setEnding] = useState(false);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, error: chatError, send } = useSessionChat(sessionId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function loadDetail() {
    return getConsultationDetail({ sessionId })
      .then(setDetail)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Gagal memuat detail sesi"));
  }

  useEffect(() => {
    loadDetail();
    // loadDetail is intentionally not in the dep array: it always closes
    // over the same sessionId prop and re-creating it every render would
    // just re-run this effect for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleConfirmTakeOver() {
    setTakingOver(true);
    setActionError(null);
    try {
      await takeOverConsultation({ sessionId });
      setConfirmingTakeOver(false);
      await loadDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal mengambil alih percakapan");
    } finally {
      setTakingOver(false);
    }
  }

  async function handleEnd() {
    setEnding(true);
    setActionError(null);
    try {
      await endConsultationAsGuru({ sessionId });
      await loadDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal menandai sesi selesai");
    } finally {
      setEnding(false);
    }
  }

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setActionError(null);
    try {
      await send(body);
      setDraft("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Pesan gagal terkirim, coba lagi");
    }
  }

  if (loadError) {
    return (
      <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
        {loadError}
      </p>
    );
  }

  if (!detail) {
    return <p className="text-body-md text-on-surface-variant">Memuat detail sesi...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {!detail.hasTakenOver && (
        <div className="rounded-md bg-secondary-container px-4 py-3 text-label-md text-on-secondary-container">
          👁️ Mode Pantau: Guru/BK dapat melihat seluruh isi percakapan.
        </div>
      )}

      {actionError && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {actionError}
        </p>
      )}

      <Link href="/guru/konsultasi" className="text-label-md font-semibold text-primary">
        ← Kembali ke Daftar Konsultasi
      </Link>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <h2 className="text-headline-md text-on-surface">Detail Sesi</h2>
            <div>
              <p className="text-label-sm uppercase text-on-surface-variant">Pengguna (Anonim)</p>
              <p className="mt-1 font-semibold text-on-surface">{detail.studentDisplayName}</p>
            </div>
            <div>
              <p className="text-label-sm uppercase text-on-surface-variant">Kader Sebaya</p>
              <p className="mt-1 font-semibold text-on-surface">
                {detail.assignedKaderName ?? "- Belum Ditugaskan -"}
              </p>
            </div>
            <div>
              <p className="text-label-sm uppercase text-on-surface-variant">Topik</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {detail.topics.length === 0 && <span className="text-body-md text-on-surface-variant">-</span>}
                {detail.topics.map((topic) => (
                  <Chip key={topic} tone="secondary">
                    {TOPIC_LABELS[topic]}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="text-label-sm uppercase text-on-surface-variant">Status</p>
              <Chip tone={SESSION_STATUS_TONES[detail.status]} className="mt-1">
                {SESSION_STATUS_LABELS[detail.status]}
              </Chip>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-headline-md text-on-surface">Tindakan Guru/BK</h2>
            {!detail.hasTakenOver && detail.status !== "ended" && (
              <Button onClick={() => setConfirmingTakeOver(true)}>✋ Ambil Alih Percakapan</Button>
            )}
            <Button variant="secondary" disabled title="Segera hadir">
              ⇄ Alihkan ke Profesional
            </Button>
            <Button variant="ghost" onClick={handleEnd} disabled={ending || detail.status === "ended"}>
              {ending ? "Menandai..." : "✓ Tandai Selesai"}
            </Button>
            <Button variant="ghost" disabled title="Segera hadir">
              🗑 Hapus Log
            </Button>
          </Card>
        </div>

        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="text-headline-md text-on-surface">Transkrip Percakapan</h2>
            <p className="text-label-sm text-on-surface-variant">Dimulai: {formatTime(detail.createdAt)}</p>
          </div>

          {chatError && (
            <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
              {chatError}
            </p>
          )}

          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {messages.map((message) => (
              <ChatBubble
                key={message.id}
                senderRole={message.senderRole}
                viewerRole="guru"
                body={message.body}
                timestamp={formatTime(message.createdAt)}
                avatarNode={
                  message.senderRole !== "guru" ? (
                    <StudentAvatar displayName={detail.studentDisplayName} />
                  ) : undefined
                }
                readReceipt={message.senderRole === "guru" ? "sent" : undefined}
              />
            ))}
            <div ref={bottomRef} />
          </div>

          {detail.hasTakenOver && (
            <div className="flex items-center gap-2 border-t border-outline-variant pt-3">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ketik balasan..."
                rows={1}
                className="flex-1 resize-none rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
              />
              <Button onClick={handleSend} disabled={!draft.trim()}>
                Kirim
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Modal
        open={confirmingTakeOver}
        onClose={() => setConfirmingTakeOver(false)}
        title="Ambil alih percakapan?"
        description="Sesi ini akan dipindahkan dari kader sebaya ke Anda. Kader sebelumnya tidak akan lagi melihat sesi ini sebagai konsultasi aktifnya."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingTakeOver(false)} disabled={takingOver}>
              Batal
            </Button>
            <Button onClick={handleConfirmTakeOver} disabled={takingOver}>
              {takingOver ? "Mengambil alih..." : "Ambil Alih"}
            </Button>
          </>
        }
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

Create `src/app/guru/(protected)/konsultasi/[sessionId]/page.tsx`:

```tsx
import { ConsultationDetailScreen } from "@/components/guru/ConsultationDetailScreen";

export default async function GuruConsultationDetailPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ConsultationDetailScreen sessionId={sessionId} />;
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. Using a test session (create one via the Supabase dashboard if needed: insert into `sessions` with any `student_local_id`, `status = 'active'`, `assigned_to` set to a test kader's `profiles.id`, `topics = '{akademik}'`), open `/guru/konsultasi/<sessionId>` as a verified guru. Confirm:
1. The "Mode Pantau" banner shows, the info card shows the assigned kader's name and topic, and any existing messages render read-only with no input box.
2. Click "Ambil Alih Percakapan", confirm in the modal, and confirm the banner disappears, an input box appears, and the info card's "Kader Sebaya" now shows your own guru name.
3. Send a message, confirm it appears immediately as a right-aligned bubble.
4. Click "Tandai Selesai", confirm the status chip flips to "Selesai" and both action buttons for an active session (Ambil Alih, Tandai Selesai) stop rendering/enable-state accordingly.
5. Confirm "Alihkan ke Profesional" and "Hapus Log" render but are disabled.

- [ ] **Step 5: Commit**

```bash
git add src/components/guru/ConsultationDetailScreen.tsx "src/app/guru/(protected)/konsultasi/[sessionId]/page.tsx"
git commit -m "feat(guru): add Detail Konsultasi screen and route"
```

---

### Task 13: Guru Profil page (minimal)

**Files:**
- Create: `src/app/guru/(protected)/profil/page.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`.
- Produces: the `/guru/profil` route.

- [ ] **Step 1: Implement**

Create `src/app/guru/(protected)/profil/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function GuruProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/guru/login");
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();

  const fullName = (profile?.full_name as string | null) ?? "Guru BK";
  const initial = fullName.trim().charAt(0).toUpperCase() || "G";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-md text-center">
        <div
          aria-hidden="true"
          className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-fixed text-headline-lg text-on-primary-fixed"
        >
          {initial}
        </div>
        <h1 className="text-headline-md font-bold text-on-surface">Pak/Bu {fullName}</h1>
        <p className="rounded-full bg-primary-fixed-dim px-3 py-1 text-label-md text-primary">Guru BK</p>
      </div>

      <p className="text-body-md text-on-surface-variant">
        Pengaturan profil tambahan akan tersedia pada pembaruan berikutnya.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, navigate to `/guru/profil` while logged in as a verified guru, confirm the name/badge render.

- [ ] **Step 4: Commit**

```bash
git add "src/app/guru/(protected)/profil/page.tsx"
git commit -m "feat(guru): add minimal Profil page"
```

---

### Task 14: Update GuruLayout nav items

**Files:**
- Modify: `src/app/guru/(protected)/layout.tsx:7`

**Interfaces:**
- None — this only changes the `navItems` array already passed into `GuruShell`.

- [ ] **Step 1: Update the nav list**

In `src/app/guru/(protected)/layout.tsx`, replace:

```typescript
const navItems = [{ href: "/guru", label: "Beranda", icon: "🏠" }];
```

with:

```typescript
const navItems = [
  { href: "/guru", label: "Beranda", icon: "🏠" },
  { href: "/guru/konsultasi", label: "Daftar Konsultasi", icon: "📋" },
  { href: "/guru/profil", label: "Profil", icon: "🙂" },
];
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, log in as a verified guru, confirm the sidebar (desktop) and bottom nav (mobile width) both show Beranda / Daftar Konsultasi / Profil, and that each link navigates and highlights correctly.

- [ ] **Step 4: Commit**

```bash
git add "src/app/guru/(protected)/layout.tsx"
git commit -m "feat(guru): add Daftar Konsultasi and Profil to guru nav"
```

---

### Task 15: Full regression pass and manual walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: PASS — `tests/schema.test.ts`, `tests/chat.test.ts`, `tests/student-actions.test.ts`, `tests/student-types.test.ts`, `tests/kader-actions.test.ts`, `tests/guru-actions.test.ts` all green.

- [ ] **Step 2: Type-check and lint the whole project**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual end-to-end walkthrough**

Run: `npm run dev`. As a verified guru:
1. Log in at `/guru/login` — lands on `/guru` with the greeting, 4 stat cards, "Butuh Perhatian", and "Aktivitas Terbaru".
2. Via the Supabase dashboard, create a test student identity, a kader, and a session assigned to that kader with `status = 'active'` and one `messages` row (`sender_role = 'student'`). Refresh `/guru` and confirm the session appears in "Aktivitas Terbaru" with the right topic/kader/status, and its count is reflected in the "Sedang Berlangsung" stat card.
3. Insert a row into `escalations` for that session with `status = 'pending'`, refresh `/guru`, confirm it appears in "Butuh Perhatian" tagged "Eskalasi" and links to the session's Detail Konsultasi.
4. Go to `/guru/konsultasi`, confirm the same session appears in the table; try the search box (by the resolved display name) and the status tabs, confirm the table narrows correctly.
5. Click into the session's Detail Konsultasi. Confirm the "Mode Pantau" banner, info card, and read-only transcript render.
6. Click "Ambil Alih Percakapan", confirm the modal, confirm on accept the banner disappears, an input appears, and "Kader Sebaya" now shows your own name.
7. Send a message, confirm it appears immediately; open the same session as the original kader (or check via Supabase) and confirm it's no longer in that kader's own `/kader` active list (since `assigned_to` moved to the guru).
8. Click "Tandai Selesai", confirm the status flips to "Selesai" and the session's "Selesai" count increments on `/guru`.
9. Visit `/guru/profil`, confirm identity renders.

- [ ] **Step 4: Confirm no unrelated regressions**

Log in as a kader and as a student (existing flows) and confirm both still work — this plan didn't touch `src/app/kader/`, `src/app/student/`, or `src/lib/chat/`, `src/lib/kader/`, `src/lib/student/`.
