# Guru Portal Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Statistik & Analitik (`/guru/statistik`), and wire up the two disabled Detail Konsultasi buttons — "Alihkan ke Profesional" (a log-only case-management marker) and "Hapus Log" (archive, not delete) — so a guru can see aggregate consultation data and use both previously-inert actions end-to-end.

**Architecture:** Two small additive schema pieces (`sessions.archived_at`, new `professional_referrals` table). Three new/changed `src/lib/guru/core.ts` functions (`getGuruStatisticsCore`, `archiveSessionCore`, `referToProfessionalCore`) plus one extended one (`getConsultationDetailCore`), all following Phase 1's `..Core`/action-wrapper split. New `src/components/guru/` chart components built on Recharts, wired together by a new `StatisticsScreen`. Existing `ConsultationDetailScreen`/`ConsultationTable`/`ConsultationListScreen` get targeted edits, not rewrites.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS), TypeScript, Tailwind v4, Recharts (new dependency, `^3.10.1`), Vitest integration tests against a real Supabase project.

**Spec:** `docs/superpowers/specs/2026-08-28-guru-portal-phase2-design.md`

## Global Constraints

- No manual authorization checks beyond what RLS (`is_guru()`) already enforces — same as Phase 1. Every new/changed query-bearing function keeps the `..Core(supabase, ...)` (testable, explicit client) / `"use server"` action-wrapper split.
- **Any new table gets explicit `revoke all` + `grant select/insert ...` statements in `supabase/schema.sql`**, in that order, right after `enable row level security`. Per the file's own §15 comment, Supabase auto-grants `anon`/`authenticated` full access to every new table in `public` regardless of RLS — and an unmatched RLS policy fails *silently* (0 rows, not an error), so a missing revoke/grant is invisible unless explicitly tested. `professional_referrals` must follow this exactly like every existing table does.
- "Hapus Log" never deletes data — `archived_at` is a visibility flag only. Every query that lists/counts sessions for guru-facing UI must exclude archived sessions by default.
- "Alihkan ke Profesional" is a log-only marker — no new role, no notification, no schema for a real handoff.
- Reuse existing constants/types — `Topic`, `TOPICS`, `TOPIC_LABELS` from `@/lib/student/types`; `SessionStatus` from `@/lib/kader/types`; `SESSION_STATUS_LABELS`/`SESSION_STATUS_TONES` from `@/lib/guru/types`. Do not redefine them.
- All user-facing copy and thrown error messages are Bahasa Indonesia.
- `sessions.status` genuinely reaches `'escalated'` in this app (set automatically by the `on_escalation_created` trigger in `supabase/schema.sql`) — unlike `'waiting'`, it is not a dead value. Do not build any synthetic/derived status bucketing; group directly on the real `status` column.
- Component tasks in this plan (charts, screens) follow Phase 1's convention: implement, `npx tsc --noEmit`, manual check where relevant, commit — no React render-testing framework exists in this repo and this plan doesn't introduce one.

---

### Task 1: Schema — `sessions.archived_at`, `professional_referrals` table, RLS, grants

**Files:**
- Modify: `supabase/schema.sql` (append new sections after the existing §22 backfill, at the end of the file)
- Modify: `tests/schema.test.ts` (append to the existing `describe("schema: anon has no direct access to student-facing tables", ...)` block)

**Interfaces:**
- Consumes: `getAnonClient` from `./helpers`.
- Produces: `sessions.archived_at` column and `public.professional_referrals` table (both used by every later task in this plan).

- [ ] **Step 1: Write the failing tests**

In `tests/schema.test.ts`, add two `it` blocks inside the existing first `describe` block (right after the `"cannot insert into session_reports"` test, before its closing `});`):

```typescript
  it("cannot select from professional_referrals", async () => {
    const anon = getAnonClient();
    const { error } = await anon.from("professional_referrals").select("id");
    expect(error?.code).toBe("42501");
  });

  it("cannot insert into professional_referrals", async () => {
    const anon = getAnonClient();
    const { error } = await anon.from("professional_referrals").insert({
      session_id: "00000000-0000-0000-0000-000000000000",
      referred_by: "00000000-0000-0000-0000-000000000000",
    });
    expect(error?.code).toBe("42501");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/schema.test.ts`
Expected: FAIL — `professional_referrals` doesn't exist yet, so Postgres returns `42P01` (undefined_table), not the expected `42501`.

- [ ] **Step 3: Add the schema changes**

Append to the end of `supabase/schema.sql` (after the §22 backfill block):

```sql

-- -------------------------------------------------------------
-- 23. sessions.archived_at (Guru Phase 2: "Hapus Log" — arsip, bukan hapus)
-- -------------------------------------------------------------
alter table public.sessions add column if not exists archived_at timestamptz;

-- -------------------------------------------------------------
-- 24. Tabel professional_referrals (Guru Phase 2: "Alihkan ke Profesional")
-- -------------------------------------------------------------
create table if not exists public.professional_referrals (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  referred_by uuid not null references public.profiles (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

alter table public.professional_referrals enable row level security;

-- -------------------------------------------------------------
-- 25. GRANTS — professional_referrals
-- -------------------------------------------------------------
revoke all on public.professional_referrals from anon, authenticated;
grant select, insert on public.professional_referrals to authenticated;

-- -------------------------------------------------------------
-- 26. RLS POLICIES — professional_referrals (guru-only, append-only)
-- -------------------------------------------------------------
drop policy if exists "professional_referrals: guru baca" on public.professional_referrals;
create policy "professional_referrals: guru baca"
  on public.professional_referrals for select
  to authenticated
  using (public.is_guru());

drop policy if exists "professional_referrals: guru buat" on public.professional_referrals;
create policy "professional_referrals: guru buat"
  on public.professional_referrals for insert
  to authenticated
  with check (public.is_guru() and referred_by = auth.uid());
```

- [ ] **Step 4: Apply the schema to the Supabase project**

Open the Supabase Dashboard → SQL Editor for this project, paste the full updated `supabase/schema.sql` (it's idempotent — safe to re-run in full), and execute it. (If a linked Supabase CLI project is set up locally, `supabase db push` is equivalent — check for a `supabase/config.toml` first; this repo has none committed, so the dashboard path is the default.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/schema.test.ts`
Expected: PASS — all tests in the file, including the two new ones.

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql tests/schema.test.ts
git commit -m "feat(guru): add sessions.archived_at and professional_referrals table"
```

---

### Task 2: Archive-aware default filtering (Beranda + Daftar Konsultasi)

**Files:**
- Modify: `src/lib/guru/types.ts`
- Modify: `src/lib/guru/core.ts` (`getGuruDashboardCore`, `listConsultationsCore`)
- Modify: `src/lib/guru/actions.ts` (`listConsultations`)
- Test: `tests/guru-actions.test.ts` (extend existing `describe` blocks)

**Interfaces:**
- Consumes: nothing new.
- Produces: `ConsultationListItem.archived: boolean`; `listConsultationsCore(supabase, { ...,  includeArchived?: boolean })`; `listConsultations({ ..., includeArchived?: boolean })`. Consumed by Task 12 (`ConsultationTable`/`ConsultationListScreen`).

- [ ] **Step 1: Write the failing tests**

In `tests/guru-actions.test.ts`, add inside the existing `describe("getGuruDashboardCore", ...)` block:

```typescript
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
```

Add inside the existing `describe("listConsultationsCore", ...)` block:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: FAIL — `archived_at` isn't filtered yet, so the archived session still shows up; `item.archived` is `undefined`.

- [ ] **Step 3: Add the `archived` field to `ConsultationListItem`**

In `src/lib/guru/types.ts`, replace:

```typescript
export type ConsultationListItem = {
  sessionId: string;
  studentDisplayName: string;
  topics: Topic[];
  assignedKaderName: string | null;
  status: SessionStatus;
  createdAt: string;
};
```

with:

```typescript
export type ConsultationListItem = {
  sessionId: string;
  studentDisplayName: string;
  topics: Topic[];
  assignedKaderName: string | null;
  status: SessionStatus;
  createdAt: string;
  archived: boolean;
};
```

- [ ] **Step 4: Filter `getGuruDashboardCore`'s session queries**

In `src/lib/guru/core.ts`, replace:

```typescript
  const { data: statusRows, error: statusError } = await supabase.from("sessions").select("status");
```

with:

```typescript
  const { data: statusRows, error: statusError } = await supabase
    .from("sessions")
    .select("status")
    .is("archived_at", null);
```

Replace:

```typescript
  const { data: activityRows, error: activityError } = await supabase
    .from("sessions")
    .select("id, topics, status, student_local_id, assigned_to, last_message_at, created_at");
```

with:

```typescript
  const { data: activityRows, error: activityError } = await supabase
    .from("sessions")
    .select("id, topics, status, student_local_id, assigned_to, last_message_at, created_at")
    .is("archived_at", null);
```

- [ ] **Step 5: Add `includeArchived` to `listConsultationsCore`**

In `src/lib/guru/core.ts`, replace:

```typescript
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
```

with:

```typescript
export async function listConsultationsCore(
  supabase: SupabaseClient,
  input: {
    status?: SessionStatus;
    search?: string;
    page: number;
    pageSize?: number;
    includeArchived?: boolean;
  },
): Promise<ConsultationListResult> {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;

  let query = supabase
    .from("sessions")
    .select("id, topics, status, student_local_id, assigned_to, created_at, archived_at")
    .order("created_at", { ascending: false });

  if (input.status) {
    query = query.eq("status", input.status);
  }

  if (!input.includeArchived) {
    query = query.is("archived_at", null);
  }
```

Then, in the same function, replace the `allItems` mapping:

```typescript
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
```

with:

```typescript
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
      archived: Boolean(row.archived_at),
    };
  });
```

- [ ] **Step 6: Thread `includeArchived` through the action wrapper**

In `src/lib/guru/actions.ts`, replace:

```typescript
export async function listConsultations(input: {
  status?: SessionStatus;
  search?: string;
  page: number;
}): Promise<ConsultationListResult> {
  const supabase = await createClient();
  return listConsultationsCore(supabase, input);
}
```

with:

```typescript
export async function listConsultations(input: {
  status?: SessionStatus;
  search?: string;
  page: number;
  includeArchived?: boolean;
}): Promise<ConsultationListResult> {
  const supabase = await createClient();
  return listConsultationsCore(supabase, input);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: PASS — all tests, including the two new ones.

- [ ] **Step 8: Commit**

```bash
git add src/lib/guru/types.ts src/lib/guru/core.ts src/lib/guru/actions.ts tests/guru-actions.test.ts
git commit -m "feat(guru): exclude archived sessions from Beranda and Daftar Konsultasi by default"
```

---

### Task 3: `archiveSessionCore` — "Hapus Log" action

**Files:**
- Modify: `src/lib/guru/core.ts` (add `archiveSessionCore`, after `takeOverConsultationCore`)
- Modify: `src/lib/guru/actions.ts` (add `archiveSession`)
- Test: `tests/guru-actions.test.ts` (new `describe` block)

**Interfaces:**
- Consumes: `listConsultationsCore` (Task 2), `getServiceClient` from `./helpers`.
- Produces: `archiveSessionCore(supabase, sessionId): Promise<void>` from `@/lib/guru/core`; `archiveSession({ sessionId }): Promise<void>` from `@/lib/guru/actions`. Consumed by Task 11 (`ConsultationDetailScreen`).

- [ ] **Step 1: Write the failing test**

In `tests/guru-actions.test.ts`, add the import `archiveSessionCore` to the existing import line:

```typescript
import { endConsultationAsGuruCore, takeOverConsultationCore, archiveSessionCore } from "@/lib/guru/core";
```

Add a new `describe` block at the end of the file:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: FAIL — `archiveSessionCore` is not exported yet.

- [ ] **Step 3: Implement**

In `src/lib/guru/core.ts`, add after `takeOverConsultationCore`'s closing brace:

```typescript

export async function archiveSessionCore(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { data, error } = await supabase
    .from("sessions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Gagal mengarsipkan sesi, coba lagi");
  }
}
```

In `src/lib/guru/actions.ts`, add `archiveSessionCore` to the existing import from `./core`, and add:

```typescript
export async function archiveSession(input: { sessionId: string }): Promise<void> {
  const supabase = await createClient();
  await archiveSessionCore(supabase, input.sessionId);
  revalidatePath("/guru");
  revalidatePath("/guru/konsultasi");
  revalidatePath(`/guru/konsultasi/${input.sessionId}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/guru/core.ts src/lib/guru/actions.ts tests/guru-actions.test.ts
git commit -m "feat(guru): add archiveSession server action (Hapus Log)"
```

---

### Task 4: `referToProfessionalCore` + `getConsultationDetailCore` extension

**Files:**
- Modify: `src/lib/guru/types.ts`
- Modify: `src/lib/guru/core.ts` (`getConsultationDetailCore`; add `referToProfessionalCore` after `archiveSessionCore`)
- Modify: `src/lib/guru/actions.ts`
- Test: `tests/guru-actions.test.ts`

**Interfaces:**
- Consumes: `createSignedInTestKader` from `./helpers`.
- Produces: `ConsultationDetail.archivedAt: string | null`, `ConsultationDetail.latestReferral: { note: string | null; createdAt: string } | null`; `referToProfessionalCore(supabase, { sessionId, note? }): Promise<void>`; `referToProfessional({ sessionId, note? }): Promise<void>`. Consumed by Task 11 (`ConsultationDetailScreen`).

- [ ] **Step 1: Write the failing tests**

In `tests/guru-actions.test.ts`, add `referToProfessionalCore` to the core import line, then add inside the existing `describe("getConsultationDetailCore", ...)` block:

```typescript
  it("returns archivedAt null and latestReferral null for a fresh session", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      const detail = await getConsultationDetailCore(client, sessionId);
      expect(detail.archivedAt).toBeNull();
      expect(detail.latestReferral).toBeNull();
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("returns the archived timestamp and the most recent referral", async () => {
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
      await service.from("professional_referrals").insert({
        session_id: sessionId,
        referred_by: id,
        note: "Butuh pendampingan lanjutan",
      });

      const detail = await getConsultationDetailCore(client, sessionId);
      expect(detail.archivedAt).toBeTruthy();
      expect(detail.latestReferral?.note).toBe("Butuh pendampingan lanjutan");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });
```

Add a new `describe` block at the end of the file:

```typescript
describe("referToProfessionalCore", () => {
  it("inserts a referral row with the calling guru as referred_by", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await referToProfessionalCore(client, { sessionId, note: "  Perlu psikolog  " });

      const service = getServiceClient();
      const { data } = await service
        .from("professional_referrals")
        .select("referred_by, note")
        .eq("session_id", sessionId)
        .single();
      expect(data?.referred_by).toBe(id);
      expect(data?.note).toBe("Perlu psikolog");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("stores note as null when omitted", async () => {
    const { id, client } = await createSignedInTestGuru();
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await referToProfessionalCore(client, { sessionId });

      const service = getServiceClient();
      const { data } = await service
        .from("professional_referrals")
        .select("note")
        .eq("session_id", sessionId)
        .single();
      expect(data?.note).toBeNull();
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("rejects a kader via RLS", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(referToProfessionalCore(client, { sessionId })).rejects.toThrow(
        "Gagal mencatat rujukan ke profesional",
      );
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: FAIL — `referToProfessionalCore` not exported yet; `archivedAt`/`latestReferral` not on `ConsultationDetail` yet.

- [ ] **Step 3: Add the new fields to `ConsultationDetail`**

In `src/lib/guru/types.ts`, replace:

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

with:

```typescript
export type ConsultationDetail = {
  sessionId: string;
  studentDisplayName: string;
  assignedKaderName: string | null;
  hasTakenOver: boolean;
  topics: Topic[];
  status: SessionStatus;
  createdAt: string;
  archivedAt: string | null;
  latestReferral: { note: string | null; createdAt: string } | null;
};
```

- [ ] **Step 4: Extend `getConsultationDetailCore` and add `referToProfessionalCore`**

In `src/lib/guru/core.ts`, replace the `getConsultationDetailCore` function body:

```typescript
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

  const assignedTo = session.assigned_to as string | null;

  const identityById = await resolveStudentDisplayNames(supabase, [session.student_local_id as string]);
  const kaderNameById = await resolveKaderNames(supabase, assignedTo ? [assignedTo] : []);
  const identity = identityById.get(session.student_local_id as string);

  return {
    sessionId: session.id as string,
    studentDisplayName: getStudentDisplayName(identity?.nickname, identity?.avatar_seed),
    assignedKaderName: assignedTo ? kaderNameById.get(assignedTo) ?? null : null,
    hasTakenOver: assignedTo === user.id,
    topics: (session.topics as Topic[]) ?? [],
    status: session.status as SessionStatus,
    createdAt: session.created_at as string,
  };
}
```

with:

```typescript
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
    .select("id, topics, status, student_local_id, assigned_to, created_at, archived_at")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    throw new Error("Sesi tidak ditemukan");
  }

  const assignedTo = session.assigned_to as string | null;

  const identityById = await resolveStudentDisplayNames(supabase, [session.student_local_id as string]);
  const kaderNameById = await resolveKaderNames(supabase, assignedTo ? [assignedTo] : []);
  const identity = identityById.get(session.student_local_id as string);

  const { data: referralRows } = await supabase
    .from("professional_referrals")
    .select("note, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1);

  const latestReferral = referralRows?.[0]
    ? { note: referralRows[0].note as string | null, createdAt: referralRows[0].created_at as string }
    : null;

  return {
    sessionId: session.id as string,
    studentDisplayName: getStudentDisplayName(identity?.nickname, identity?.avatar_seed),
    assignedKaderName: assignedTo ? kaderNameById.get(assignedTo) ?? null : null,
    hasTakenOver: assignedTo === user.id,
    topics: (session.topics as Topic[]) ?? [],
    status: session.status as SessionStatus,
    createdAt: session.created_at as string,
    archivedAt: (session.archived_at as string | null) ?? null,
    latestReferral,
  };
}
```

Add after `archiveSessionCore`'s closing brace:

```typescript

export async function referToProfessionalCore(
  supabase: SupabaseClient,
  input: { sessionId: string; note?: string },
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const note = input.note?.trim();
  const { error } = await supabase.from("professional_referrals").insert({
    session_id: input.sessionId,
    referred_by: user.id,
    note: note ? note : null,
  });

  if (error) {
    throw new Error("Gagal mencatat rujukan ke profesional");
  }
}
```

- [ ] **Step 5: Add the action wrapper**

In `src/lib/guru/actions.ts`, add `referToProfessionalCore` to the import from `./core`, and add:

```typescript
export async function referToProfessional(input: { sessionId: string; note?: string }): Promise<void> {
  const supabase = await createClient();
  await referToProfessionalCore(supabase, input);
  revalidatePath(`/guru/konsultasi/${input.sessionId}`);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/guru/types.ts src/lib/guru/core.ts src/lib/guru/actions.ts tests/guru-actions.test.ts
git commit -m "feat(guru): add referToProfessional server action and detail fields"
```

---

### Task 5: `getGuruStatisticsCore` — Statistik & Analitik data

**Files:**
- Modify: `src/lib/guru/types.ts`
- Modify: `src/lib/guru/core.ts` (add `getGuruStatisticsCore`, after `referToProfessionalCore`)
- Modify: `src/lib/guru/actions.ts`
- Test: `tests/guru-actions.test.ts`

**Interfaces:**
- Consumes: `TOPICS` from `@/lib/student/types` (value, not just the `Topic` type — needs adding to the existing import).
- Produces: `StatisticsRangeDays`, `StatisticsTrendPoint`, `StatusDistributionEntry`, `TopicDistributionEntry`, `GuruStatistics` types from `@/lib/guru/types`; `getGuruStatisticsCore(supabase, rangeDays): Promise<GuruStatistics>`; `getGuruStatistics(rangeDays): Promise<GuruStatistics>`. Consumed by Tasks 7–10 (chart components and `StatisticsScreen`).

- [ ] **Step 1: Write the failing tests**

In `tests/guru-actions.test.ts`, add `getGuruStatisticsCore` to the core import line. Add a new `describe` block at the end of the file:

```typescript
describe("getGuruStatisticsCore", () => {
  it("returns an all-zero, well-formed shape for an unverified guru (RLS-filtered to zero rows)", async () => {
    const { id, client } = await createSignedInTestGuru({ verified: false });
    try {
      const result = await getGuruStatisticsCore(client, 30);
      expect(result.totalSessions).toBe(0);
      expect(result.activeStudents).toBe(0);
      expect(result.avgDurationMinutes).toBeNull();
      expect(result.escalationCount).toBe(0);
      expect(result.trend.every((point) => point.count === 0)).toBe(true);
      expect(result.statusDistribution.every((entry) => entry.count === 0)).toBe(true);
      expect(result.topicDistribution.every((entry) => entry.count === 0)).toBe(true);
    } finally {
      await deleteTestUser(id);
    }
  });

  it("returns a trend array spanning exactly rangeDays days ending today (UTC), in order", async () => {
    const { id, client } = await createSignedInTestGuru();
    try {
      const result = await getGuruStatisticsCore(client, 7);
      expect(result.trend).toHaveLength(7);
      const today = new Date().toISOString().slice(0, 10);
      expect(result.trend[result.trend.length - 1].date).toBe(today);
      const dates = result.trend.map((point) => point.date);
      expect(dates).toEqual([...dates].sort());
    } finally {
      await deleteTestUser(id);
    }
  });

  it("covers all 4 statuses in order and sums to totalSessions", async () => {
    const { id, client } = await createSignedInTestGuru();
    try {
      const result = await getGuruStatisticsCore(client, 30);
      expect(result.statusDistribution.map((entry) => entry.status)).toEqual([
        "waiting",
        "active",
        "escalated",
        "ended",
      ]);
      const sum = result.statusDistribution.reduce((total, entry) => total + entry.count, 0);
      expect(sum).toBe(result.totalSessions);
    } finally {
      await deleteTestUser(id);
    }
  });

  it("covers all 7 topics in order, and the trend sums to totalSessions", async () => {
    const { id, client } = await createSignedInTestGuru();
    try {
      const result = await getGuruStatisticsCore(client, 30);
      expect(result.topicDistribution.map((entry) => entry.topic)).toEqual([
        "pertemanan",
        "bullying",
        "keluarga",
        "akademik",
        "perasaan",
        "lingkungan_sekolah",
        "lainnya",
      ]);
      const trendSum = result.trend.reduce((total, point) => total + point.count, 0);
      expect(trendSum).toBe(result.totalSessions);
      expect(result.activeStudents).toBeLessThanOrEqual(result.totalSessions);
    } finally {
      await deleteTestUser(id);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: FAIL — `getGuruStatisticsCore` not exported yet.

- [ ] **Step 3: Add the types**

In `src/lib/guru/types.ts`, add:

```typescript
export type StatisticsRangeDays = 7 | 30 | 90;

export type StatisticsTrendPoint = { date: string; count: number };

export type StatusDistributionEntry = { status: SessionStatus; count: number };

export type TopicDistributionEntry = { topic: Topic; count: number };

export type GuruStatistics = {
  totalSessions: number;
  activeStudents: number;
  avgDurationMinutes: number | null;
  escalationCount: number;
  trend: StatisticsTrendPoint[];
  statusDistribution: StatusDistributionEntry[];
  topicDistribution: TopicDistributionEntry[];
};
```

- [ ] **Step 4: Implement the core function**

In `src/lib/guru/core.ts`, change the student-types import from:

```typescript
import { getStudentDisplayName } from "@/lib/student/types";
```

to:

```typescript
import { getStudentDisplayName, TOPICS } from "@/lib/student/types";
```

Add a module-level constant near `ACTIVITY_LIMIT`/`ATTENTION_LIMIT`:

```typescript
const SESSION_STATUS_ORDER: SessionStatus[] = ["waiting", "active", "escalated", "ended"];
```

Add after `referToProfessionalCore`'s closing brace:

```typescript

export async function getGuruStatisticsCore(
  supabase: SupabaseClient,
  rangeDays: StatisticsRangeDays,
): Promise<GuruStatistics> {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceUtc = todayUtc - (rangeDays - 1) * 24 * 60 * 60 * 1000;
  const since = new Date(sinceUtc).toISOString();

  const [{ data: sessionRows, error: sessionsError }, { data: escalationRows, error: escalationsError }] =
    await Promise.all([
      supabase
        .from("sessions")
        .select("id, topics, status, student_local_id, started_at, ended_at, created_at")
        .gte("created_at", since)
        .is("archived_at", null),
      supabase.from("escalations").select("id").eq("status", "pending").gte("created_at", since),
    ]);

  if (sessionsError || escalationsError) {
    throw new Error("Gagal memuat statistik konsultasi");
  }

  const sessions = sessionRows ?? [];
  const totalSessions = sessions.length;
  const activeStudents = new Set(sessions.map((row) => row.student_local_id as string)).size;

  const durations = sessions
    .map((row) => {
      const startedAt = row.started_at as string | null;
      const endedAt = row.ended_at as string | null;
      if (!startedAt || !endedAt) return null;
      return (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000;
    })
    .filter((minutes): minutes is number => minutes !== null);
  const avgDurationMinutes =
    durations.length > 0 ? durations.reduce((sum, minutes) => sum + minutes, 0) / durations.length : null;

  const escalationCount = (escalationRows ?? []).length;

  const trendByDate = new Map<string, number>();
  for (let i = 0; i < rangeDays; i += 1) {
    const date = new Date(sinceUtc + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    trendByDate.set(date, 0);
  }
  for (const row of sessions) {
    const date = (row.created_at as string).slice(0, 10);
    trendByDate.set(date, (trendByDate.get(date) ?? 0) + 1);
  }
  const trend: StatisticsTrendPoint[] = [...trendByDate.entries()].map(([date, count]) => ({ date, count }));

  const statusCounts = new Map<SessionStatus, number>(SESSION_STATUS_ORDER.map((status) => [status, 0]));
  for (const row of sessions) {
    const status = row.status as SessionStatus;
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }
  const statusDistribution: StatusDistributionEntry[] = SESSION_STATUS_ORDER.map((status) => ({
    status,
    count: statusCounts.get(status) ?? 0,
  }));

  const topicCounts = new Map<Topic, number>(TOPICS.map((topic) => [topic, 0]));
  for (const row of sessions) {
    for (const topic of (row.topics as Topic[]) ?? []) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }
  const topicDistribution: TopicDistributionEntry[] = TOPICS.map((topic) => ({
    topic,
    count: topicCounts.get(topic) ?? 0,
  }));

  return {
    totalSessions,
    activeStudents,
    avgDurationMinutes,
    escalationCount,
    trend,
    statusDistribution,
    topicDistribution,
  };
}
```

Also add `StatisticsRangeDays`, `StatisticsTrendPoint`, `StatusDistributionEntry`, `TopicDistributionEntry`, `GuruStatistics` to the `import type { ... } from "./types";` line at the top of `core.ts`.

- [ ] **Step 5: Add the action wrapper**

In `src/lib/guru/actions.ts`, add `getGuruStatisticsCore` to the import from `./core`, add `GuruStatistics`, `StatisticsRangeDays` to the `import type` line, and add:

```typescript
export async function getGuruStatistics(rangeDays: StatisticsRangeDays): Promise<GuruStatistics> {
  const supabase = await createClient();
  return getGuruStatisticsCore(supabase, rangeDays);
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/guru-actions.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in `tests/schema.test.ts`, `tests/chat.test.ts`, `tests/student-actions.test.ts`, `tests/student-types.test.ts`, `tests/kader-actions.test.ts`, `tests/guru-actions.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/guru/types.ts src/lib/guru/core.ts src/lib/guru/actions.ts tests/guru-actions.test.ts
git commit -m "feat(guru): add getGuruStatistics query (totals, trend, status/topic distribution)"
```

---

### Task 6: `StatCard` — optional `caption` prop

**Files:**
- Modify: `src/components/guru/StatCard.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `StatCard({ icon, label, value, caption? })`. Consumed by Task 10 (`StatisticsScreen`); Beranda's existing usage (`DashboardScreen.tsx`) is unaffected since `caption` is optional.

- [ ] **Step 1: Implement**

In `src/components/guru/StatCard.tsx`, replace the whole file:

```tsx
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export function StatCard({
  icon,
  label,
  value,
  caption,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  caption?: ReactNode;
}) {
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
        {caption && <p className="text-label-sm text-on-surface-variant">{caption}</p>}
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/guru/StatCard.tsx
git commit -m "feat(guru): add optional caption prop to StatCard"
```

---

### Task 7: Install Recharts + `TrendChart` component

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/components/guru/TrendChart.tsx`

**Interfaces:**
- Consumes: `StatisticsTrendPoint` (Task 5) from `@/lib/guru/types`; `Card` from `@/components/ui/Card`.
- Produces: `TrendChart({ trend: StatisticsTrendPoint[] })`. Consumed by Task 10 (`StatisticsScreen`).

- [ ] **Step 1: Install Recharts**

Run: `npm install recharts@^3.10.1`
Expected: `recharts` added to `dependencies` in `package.json`.

- [ ] **Step 2: Implement**

Create `src/components/guru/TrendChart.tsx`:

```tsx
"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/Card";
import type { StatisticsTrendPoint } from "@/lib/guru/types";

function formatDateLabel(date: string): string {
  return new Date(date).toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

export function TrendChart({ trend }: { trend: StatisticsTrendPoint[] }) {
  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-headline-md text-on-surface">Tren Konsultasi</h2>
        <p className="text-label-sm text-on-surface-variant">Jumlah sesi konsultasi per hari</p>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={trend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDateLabel}
              stroke="var(--color-on-surface-variant)"
              fontSize={12}
            />
            <YAxis allowDecimals={false} stroke="var(--color-on-surface-variant)" fontSize={12} />
            <Tooltip labelFormatter={(value) => formatDateLabel(String(value))} />
            <Area
              type="monotone"
              dataKey="count"
              name="Sesi Konsultasi"
              stroke="var(--color-primary)"
              fill="var(--color-primary)"
              fillOpacity={0.15}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/components/guru/TrendChart.tsx
git commit -m "feat(guru): install Recharts and add TrendChart component"
```

---

### Task 8: `StatusDonutChart` component

**Files:**
- Create: `src/components/guru/StatusDonutChart.tsx`

**Interfaces:**
- Consumes: `StatusDistributionEntry` (Task 5), `SESSION_STATUS_LABELS` from `@/lib/guru/types`; `SessionStatus` from `@/lib/kader/types`; `Card` from `@/components/ui/Card`.
- Produces: `StatusDonutChart({ distribution: StatusDistributionEntry[] })`. Consumed by Task 10 (`StatisticsScreen`).

- [ ] **Step 1: Implement**

Create `src/components/guru/StatusDonutChart.tsx`:

```tsx
"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card } from "@/components/ui/Card";
import { SESSION_STATUS_LABELS } from "@/lib/guru/types";
import type { StatusDistributionEntry } from "@/lib/guru/types";
import type { SessionStatus } from "@/lib/kader/types";

const STATUS_COLORS: Record<SessionStatus, string> = {
  waiting: "var(--color-outline)",
  active: "var(--color-primary)",
  escalated: "var(--color-error)",
  ended: "var(--color-tertiary)",
};

export function StatusDonutChart({ distribution }: { distribution: StatusDistributionEntry[] }) {
  const data = distribution.map((entry) => ({
    name: SESSION_STATUS_LABELS[entry.status],
    value: entry.count,
    status: entry.status,
  }));
  const hasData = distribution.some((entry) => entry.count > 0);

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-headline-md text-on-surface">Status Konsultasi</h2>
        <p className="text-label-sm text-on-surface-variant">Distribusi penyelesaian</p>
      </div>
      {hasData ? (
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={2}>
                {data.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-body-md text-on-surface-variant">Belum ada data pada rentang ini.</p>
      )}
    </Card>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/guru/StatusDonutChart.tsx
git commit -m "feat(guru): add StatusDonutChart component"
```

---

### Task 9: `TopicBarChart` component

**Files:**
- Create: `src/components/guru/TopicBarChart.tsx`

**Interfaces:**
- Consumes: `TopicDistributionEntry` (Task 5) from `@/lib/guru/types`; `TOPIC_LABELS` from `@/lib/student/types`; `Card` from `@/components/ui/Card`.
- Produces: `TopicBarChart({ distribution: TopicDistributionEntry[] })`. Consumed by Task 10 (`StatisticsScreen`).

- [ ] **Step 1: Implement**

Create `src/components/guru/TopicBarChart.tsx`:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/ui/Card";
import { TOPIC_LABELS } from "@/lib/student/types";
import type { TopicDistributionEntry } from "@/lib/guru/types";

export function TopicBarChart({ distribution }: { distribution: TopicDistributionEntry[] }) {
  const data = distribution.map((entry) => ({
    topic: TOPIC_LABELS[entry.topic],
    count: entry.count,
  }));

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <h2 className="text-headline-md text-on-surface">Konsultasi Berdasarkan Topik</h2>
        <p className="text-label-sm text-on-surface-variant">Kategorisasi isu yang dibahas siswa</p>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" />
            <XAxis dataKey="topic" stroke="var(--color-on-surface-variant)" fontSize={12} />
            <YAxis allowDecimals={false} stroke="var(--color-on-surface-variant)" fontSize={12} />
            <Tooltip />
            <Bar dataKey="count" name="Jumlah Sesi" fill="var(--color-secondary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/guru/TopicBarChart.tsx
git commit -m "feat(guru): add TopicBarChart component"
```

---

### Task 10: `StatisticsScreen` — wire Statistik & Analitik together

**Files:**
- Create: `src/components/guru/StatisticsScreen.tsx`
- Create: `src/app/guru/(protected)/statistik/page.tsx`
- Modify: `src/app/guru/(protected)/layout.tsx`

**Interfaces:**
- Consumes: `getGuruStatistics` (Task 5) from `@/lib/guru/actions`; `GuruStatistics`, `StatisticsRangeDays`, `SESSION_STATUS_LABELS` from `@/lib/guru/types`; `TOPIC_LABELS` from `@/lib/student/types`; `StatCard` (Task 6), `TrendChart` (Task 7), `StatusDonutChart` (Task 8), `TopicBarChart` (Task 9); `Button` from `@/components/ui/Button`.
- Produces: `StatisticsScreen()`, the `/guru/statistik` route.

- [ ] **Step 1: Implement the screen**

Create `src/components/guru/StatisticsScreen.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getGuruStatistics } from "@/lib/guru/actions";
import { SESSION_STATUS_LABELS } from "@/lib/guru/types";
import { TOPIC_LABELS } from "@/lib/student/types";
import type { GuruStatistics, StatisticsRangeDays } from "@/lib/guru/types";
import { StatCard } from "./StatCard";
import { TrendChart } from "./TrendChart";
import { StatusDonutChart } from "./StatusDonutChart";
import { TopicBarChart } from "./TopicBarChart";

const RANGE_OPTIONS: { value: StatisticsRangeDays; label: string }[] = [
  { value: 7, label: "7 Hari Terakhir" },
  { value: 30, label: "30 Hari Terakhir" },
  { value: 90, label: "90 Hari Terakhir" },
];

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "-";
  return `${Math.round(minutes)}m`;
}

function toCsv(stats: GuruStatistics): string {
  const lines: string[] = [];
  lines.push("Ringkasan");
  lines.push("Metrik,Nilai");
  lines.push(`Total Sesi Chat,${stats.totalSessions}`);
  lines.push(`Siswa Aktif,${stats.activeStudents}`);
  lines.push(`Rata-rata Durasi (menit),${stats.avgDurationMinutes ?? ""}`);
  lines.push(`Kasus Eskalasi,${stats.escalationCount}`);
  lines.push("");
  lines.push("Tren Konsultasi");
  lines.push("Tanggal,Jumlah Sesi");
  for (const point of stats.trend) lines.push(`${point.date},${point.count}`);
  lines.push("");
  lines.push("Status Konsultasi");
  lines.push("Status,Jumlah");
  for (const entry of stats.statusDistribution) {
    lines.push(`${SESSION_STATUS_LABELS[entry.status]},${entry.count}`);
  }
  lines.push("");
  lines.push("Konsultasi Berdasarkan Topik");
  lines.push("Topik,Jumlah");
  for (const entry of stats.topicDistribution) {
    lines.push(`${TOPIC_LABELS[entry.topic]},${entry.count}`);
  }
  return lines.join("\n");
}

function downloadCsv(stats: GuruStatistics, rangeDays: StatisticsRangeDays) {
  const blob = new Blob([toCsv(stats)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `statistik-guru-${rangeDays}hari.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function StatisticsScreen() {
  const [rangeDays, setRangeDays] = useState<StatisticsRangeDays>(30);
  const [stats, setStats] = useState<GuruStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setStats(null);
    getGuruStatistics(rangeDays)
      .then((data) => {
        if (active) {
          setStats(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Gagal memuat statistik");
      });
    return () => {
      active = false;
    };
  }, [rangeDays]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
            Statistik & Analitik
          </h1>
          <p className="mt-1 text-body-md text-on-surface-variant">Ringkasan data konsultasi siswa.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value) as StatisticsRangeDays)}
            className="rounded-md border-2 border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-body-md text-on-surface outline-none"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => stats && downloadCsv(stats, rangeDays)} disabled={!stats}>
            ⬇ Export
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      {!stats && !error ? (
        <p className="text-body-md text-on-surface-variant">Memuat statistik...</p>
      ) : (
        stats && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon="💬" label="Total Sesi Chat" value={stats.totalSessions} />
              <StatCard icon="🧑‍🤝‍🧑" label="Siswa Aktif" value={stats.activeStudents} />
              <StatCard
                icon="⏱️"
                label="Rata-rata Durasi"
                value={formatDuration(stats.avgDurationMinutes)}
                caption="/ sesi"
              />
              <StatCard icon="⚠️" label="Kasus Eskalasi" value={stats.escalationCount} caption="Butuh perhatian" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(0,320px)]">
              <TrendChart trend={stats.trend} />
              <StatusDonutChart distribution={stats.statusDistribution} />
            </div>

            <TopicBarChart distribution={stats.topicDistribution} />
          </>
        )
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

Create `src/app/guru/(protected)/statistik/page.tsx`:

```tsx
import { StatisticsScreen } from "@/components/guru/StatisticsScreen";

export default function GuruStatisticsPage() {
  return <StatisticsScreen />;
}
```

- [ ] **Step 3: Add the nav item**

In `src/app/guru/(protected)/layout.tsx`, replace:

```typescript
const navItems = [
  { href: "/guru", label: "Beranda", icon: "🏠" },
  { href: "/guru/konsultasi", label: "Daftar Konsultasi", icon: "📋" },
  { href: "/guru/profil", label: "Profil", icon: "🙂" },
];
```

with:

```typescript
const navItems = [
  { href: "/guru", label: "Beranda", icon: "🏠" },
  { href: "/guru/konsultasi", label: "Daftar Konsultasi", icon: "📋" },
  { href: "/guru/statistik", label: "Statistik", icon: "📊" },
  { href: "/guru/profil", label: "Profil", icon: "🙂" },
];
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual check**

Run: `npm run dev`, log in as a verified guru, go to "Statistik" in the nav. Confirm the 4 stat cards, trend chart, status donut, and topic bar chart all render, the date-range `<select>` re-fetches on change, and "Export" downloads a CSV.

- [ ] **Step 6: Commit**

```bash
git add src/components/guru/StatisticsScreen.tsx "src/app/guru/(protected)/statistik/page.tsx" "src/app/guru/(protected)/layout.tsx"
git commit -m "feat(guru): wire up the Statistik & Analitik screen"
```

---

### Task 11: `ConsultationDetailScreen` — wire Alihkan ke Profesional & Hapus Log

**Files:**
- Modify: `src/components/guru/ConsultationDetailScreen.tsx`

**Interfaces:**
- Consumes: `archiveSession` (Task 3), `referToProfessional` (Task 4) from `@/lib/guru/actions`; `ConsultationDetail.archivedAt`/`latestReferral` (Task 4).
- Produces: nothing new for other tasks — this is a leaf UI task.

- [ ] **Step 1: Implement**

Replace the whole file `src/components/guru/ConsultationDetailScreen.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { Modal } from "@/components/ui/Modal";
import { useSessionChat } from "@/lib/chat/useSessionChat";
import {
  archiveSession,
  endConsultationAsGuru,
  getConsultationDetail,
  referToProfessional,
  takeOverConsultation,
} from "@/lib/guru/actions";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/guru/types";
import { TOPIC_LABELS } from "@/lib/student/types";
import type { ConsultationDetail } from "@/lib/guru/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatRelativeTime(iso: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return "Baru saja";
  if (diffMinutes < 60) return `${diffMinutes} mnt lalu`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} hari lalu`;
}

function SenderAvatar({ displayName, tone }: { displayName?: string; tone: "student" | "kader" }) {
  const initial = displayName?.trim().charAt(0).toUpperCase() || "A";
  const toneClasses =
    tone === "student"
      ? "bg-secondary-container text-on-secondary-container"
      : "bg-tertiary-container text-on-tertiary-container";
  return (
    <div
      aria-hidden="true"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label-sm font-bold ${toneClasses}`}
    >
      {initial}
    </div>
  );
}

export function ConsultationDetailScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<ConsultationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingTakeOver, setConfirmingTakeOver] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmingReferral, setConfirmingReferral] = useState(false);
  const [referralNote, setReferralNote] = useState("");
  const [referring, setReferring] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, error: chatError, send } = useSessionChat(sessionId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function loadDetail() {
    return getConsultationDetail({ sessionId })
      .then((data) => {
        setDetail(data);
        setLoadError(null);
      })
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

  async function handleConfirmReferral() {
    setReferring(true);
    setActionError(null);
    try {
      await referToProfessional({ sessionId, note: referralNote.trim() || undefined });
      setConfirmingReferral(false);
      setReferralNote("");
      await loadDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal mencatat rujukan ke profesional");
    } finally {
      setReferring(false);
    }
  }

  async function handleConfirmArchive() {
    setArchiving(true);
    setActionError(null);
    try {
      await archiveSession({ sessionId });
      router.push("/guru/konsultasi");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal mengarsipkan sesi");
      setArchiving(false);
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

  if (loadError && !detail) {
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

      {(loadError || actionError) && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {loadError ?? actionError}
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
              <div className="mt-1 flex flex-wrap gap-2">
                <Chip tone={SESSION_STATUS_TONES[detail.status]}>{SESSION_STATUS_LABELS[detail.status]}</Chip>
                {detail.archivedAt && <Chip tone="neutral">Diarsipkan</Chip>}
              </div>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-headline-md text-on-surface">Tindakan Guru/BK</h2>
            {!detail.hasTakenOver && detail.status !== "ended" && !detail.archivedAt && (
              <Button onClick={() => setConfirmingTakeOver(true)}>✋ Ambil Alih Percakapan</Button>
            )}
            {detail.latestReferral ? (
              <div className="flex flex-col gap-2">
                <Button variant="secondary" disabled>
                  ⇄ Alihkan ke Profesional
                </Button>
                <Chip tone="secondary">
                  Dirujuk ke Profesional · {formatRelativeTime(detail.latestReferral.createdAt)}
                </Chip>
              </div>
            ) : (
              <Button
                variant="secondary"
                onClick={() => setConfirmingReferral(true)}
                disabled={Boolean(detail.archivedAt)}
              >
                ⇄ Alihkan ke Profesional
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={handleEnd}
              disabled={ending || detail.status === "ended" || Boolean(detail.archivedAt)}
            >
              {ending ? "Menandai..." : "✓ Tandai Selesai"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmingArchive(true)}
              disabled={Boolean(detail.archivedAt)}
            >
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
                  message.senderRole === "student" ? (
                    <SenderAvatar displayName={detail.studentDisplayName} tone="student" />
                  ) : message.senderRole === "kader" ? (
                    <SenderAvatar displayName={detail.assignedKaderName ?? "Kader"} tone="kader" />
                  ) : undefined
                }
                readReceipt={message.senderRole === "guru" ? "sent" : undefined}
              />
            ))}
            <div ref={bottomRef} />
          </div>

          {detail.hasTakenOver && !detail.archivedAt && (
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

      <Modal
        open={confirmingReferral}
        onClose={() => setConfirmingReferral(false)}
        title="Alihkan ke profesional?"
        description="Tandai sesi ini sebagai butuh penanganan profesional. Ini hanya mencatat penilaian Anda — tidak ada notifikasi atau pihak lain yang otomatis terlibat."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingReferral(false)} disabled={referring}>
              Batal
            </Button>
            <Button onClick={handleConfirmReferral} disabled={referring}>
              {referring ? "Menyimpan..." : "Alihkan"}
            </Button>
          </>
        }
      >
        <textarea
          value={referralNote}
          onChange={(e) => setReferralNote(e.target.value)}
          placeholder="Catatan (opsional)"
          rows={3}
          className="w-full resize-none rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
        />
      </Modal>

      <Modal
        open={confirmingArchive}
        onClose={() => setConfirmingArchive(false)}
        title="Hapus log konsultasi?"
        description="Sesi ini akan disembunyikan dari daftar aktif. Semua data (pesan, riwayat) tetap tersimpan dan tidak dihapus."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingArchive(false)} disabled={archiving}>
              Batal
            </Button>
            <Button onClick={handleConfirmArchive} disabled={archiving}>
              {archiving ? "Menghapus..." : "Hapus Log"}
            </Button>
          </>
        }
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual check**

Run: `npm run dev`. As a verified guru, open a session's Detail Konsultasi. Click "Alihkan ke Profesional", add a note, confirm — the button disables and a "Dirujuk ke Profesional" chip appears. Click "Hapus Log", confirm — you're redirected to Daftar Konsultasi and the session no longer appears there by default.

- [ ] **Step 4: Commit**

```bash
git add src/components/guru/ConsultationDetailScreen.tsx
git commit -m "feat(guru): wire up Alihkan ke Profesional and Hapus Log"
```

---

### Task 12: `ConsultationTable` / `ConsultationListScreen` — Diarsipkan chip and toggle

**Files:**
- Modify: `src/components/guru/ConsultationTable.tsx`
- Modify: `src/components/guru/ConsultationListScreen.tsx`

**Interfaces:**
- Consumes: `ConsultationListItem.archived` (Task 2); `listConsultations({ ..., includeArchived })` (Task 2).
- Produces: nothing new for other tasks — this is a leaf UI task.

- [ ] **Step 1: Show the Diarsipkan chip in the table**

In `src/components/guru/ConsultationTable.tsx`, replace:

```tsx
                <td className="py-3 pr-3">
                  <Chip tone={SESSION_STATUS_TONES[item.status]}>{SESSION_STATUS_LABELS[item.status]}</Chip>
                </td>
```

with:

```tsx
                <td className="py-3 pr-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip tone={SESSION_STATUS_TONES[item.status]}>{SESSION_STATUS_LABELS[item.status]}</Chip>
                    {item.archived && <Chip tone="neutral">Diarsipkan</Chip>}
                  </div>
                </td>
```

- [ ] **Step 2: Add the "Tampilkan yang diarsipkan" toggle to the list screen**

In `src/components/guru/ConsultationListScreen.tsx`, replace:

```tsx
export function ConsultationListScreen() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<SessionStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ConsultationListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
```

with:

```tsx
export function ConsultationListScreen() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<SessionStatus | "all">("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ConsultationListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
```

Replace:

```tsx
  useEffect(() => {
    let active = true;
    listConsultations({ status: status === "all" ? undefined : status, search: debouncedSearch, page })
      .then((data) => {
        if (active) {
          setResult(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Gagal memuat daftar konsultasi");
      });
    return () => {
      active = false;
    };
  }, [debouncedSearch, status, page]);

  function handleStatusChange(next: SessionStatus | "all") {
    setStatus(next);
    setPage(1);
  }
```

with:

```tsx
  useEffect(() => {
    let active = true;
    listConsultations({
      status: status === "all" ? undefined : status,
      search: debouncedSearch,
      page,
      includeArchived,
    })
      .then((data) => {
        if (active) {
          setResult(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Gagal memuat daftar konsultasi");
      });
    return () => {
      active = false;
    };
  }, [debouncedSearch, status, page, includeArchived]);

  function handleStatusChange(next: SessionStatus | "all") {
    setStatus(next);
    setPage(1);
  }

  function handleIncludeArchivedChange(next: boolean) {
    setIncludeArchived(next);
    setPage(1);
  }
```

Replace the filter-row closing:

```tsx
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
```

with:

```tsx
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
        <label className="flex items-center gap-2 text-label-md text-on-surface-variant">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => handleIncludeArchivedChange(e.target.checked)}
            className="h-4 w-4 rounded border-outline-variant"
          />
          Tampilkan yang diarsipkan
        </label>
      </div>
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. On `/guru/konsultasi`, confirm archived sessions are hidden by default; checking "Tampilkan yang diarsipkan" shows them with a "Diarsipkan" chip alongside their status chip.

- [ ] **Step 5: Commit**

```bash
git add src/components/guru/ConsultationTable.tsx src/components/guru/ConsultationListScreen.tsx
git commit -m "feat(guru): show archived sessions behind a toggle in Daftar Konsultasi"
```

---

### Task 13: Full regression pass and manual walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: PASS — `tests/schema.test.ts`, `tests/chat.test.ts`, `tests/student-actions.test.ts`, `tests/student-types.test.ts`, `tests/kader-actions.test.ts`, `tests/guru-actions.test.ts` all green.

- [ ] **Step 2: Type-check and lint the whole project**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual end-to-end walkthrough**

Run: `npm run dev`. As a verified guru:
1. Go to `/guru/statistik`. Confirm the 4 stat cards, trend chart, status donut, and topic bar chart render for the default 30-day range. Switch to 7 and 90 days and confirm the numbers/charts update. Click "Export" and confirm a CSV downloads with sections for the summary, trend, status, and topic data.
2. Via the Supabase dashboard, insert an `escalations` row (`status = 'pending'`) for an existing session and confirm, on `/guru/statistik`, "Kasus Eskalasi" reflects it and the status donut's "Eskalasi" slice includes that session (its `sessions.status` should already have flipped to `'escalated'` via the DB trigger — verify this in the dashboard too).
3. Open a session's Detail Konsultasi. Click "Alihkan ke Profesional", add an optional note, confirm — the button disables and a "Dirujuk ke Profesional" badge with a relative timestamp appears.
4. On the same session, click "Hapus Log", confirm — you land back on `/guru/konsultasi` and the session is gone from the default view.
5. Check "Tampilkan yang diarsipkan" on `/guru/konsultasi` and confirm the archived session reappears with a "Diarsipkan" chip. Click into it — confirm the transcript is read-only, "Diarsipkan" shows next to the status chip, and Ambil Alih/Alihkan/Tandai Selesai/Hapus Log are all disabled or hidden.
6. Confirm `/guru` (Beranda) no longer counts or lists the archived session in "Aktivitas Terbaru".

- [ ] **Step 4: Confirm no unrelated regressions**

Log in as a kader and as a student (existing flows) and confirm both still work — this plan didn't touch `src/app/kader/`, `src/app/student/`, `src/lib/chat/`, `src/lib/kader/`, or `src/lib/student/`.
