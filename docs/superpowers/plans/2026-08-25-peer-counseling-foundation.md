# Peer Counseling Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared foundation (DB schema/RLS, student privacy mechanism, realtime chat transport, kader/guru auth & routing, design system) that the student, kader, and guru portals will all be built on top of in later plans.

**Architecture:** A rewritten Supabase schema backs three access patterns — RLS-scoped authenticated access for kader/guru, and service-role-mediated Server Actions for anonymous students (no Supabase Auth for students, per user decision). A single Realtime Broadcast channel per session (`session:{id}`) delivers chat messages to all three roles through one shared hook, since anon clients can't use RLS-gated `postgres_changes`. Kader/guru get separate login routes gated by `proxy.ts` (cheap redirect) plus per-role layouts (DB-backed role/verification checks).

**Tech Stack:** Next.js 16.3.2 (App Router, Server Actions, `proxy.ts`), Supabase (Postgres + Auth + Realtime), `@supabase/ssr` / `@supabase/supabase-js`, Tailwind CSS v4, Vitest (new — integration tests run against the real configured Supabase project).

**Spec:** [docs/superpowers/specs/2026-08-25-peer-counseling-foundation-design.md](../specs/2026-08-25-peer-counseling-foundation-design.md)

## Global Constraints

- Next.js 16: `cookies()`/`headers()`/`params`/`searchParams` are fully async — always `await` them. No `middleware.ts` — routing gate logic lives in `src/proxy.ts` / `src/lib/supabase/proxy.ts` (already the case in this repo).
- Proxy does the cheap optimistic "is anyone logged in" redirect only. Role correctness (`kader` vs `guru`) and `is_verified` gating are re-checked with a real DB read in each role's `layout.tsx` — never trust proxy alone for that.
- `anon` Postgres role gets **zero** grants on `sessions`, `messages`, `student_identities`, `session_reports`, `session_assignments`, `escalations`. All student-side reads/writes go through Server Actions using the service-role client.
- Chat message delivery uses a Supabase Realtime **Broadcast** channel named `session:{sessionId}` for every role (not `postgres_changes`), because anon has no RLS-visible identity.
- Design tokens (colors, type scale, spacing, radius) come verbatim from `design/kader/ruang_cerita_design_system/DESIGN.md` — do not invent new values or a dark-mode palette that isn't in that doc.
- This is a fresh dev database (one prior commit only) — `supabase/schema.sql` is rewritten wholesale, not migrated column-by-column.
- I (the AI/engineer) cannot execute SQL against the Supabase project or read/generate the service-role secret — those specific steps are manual, performed by the human running this plan, and are called out explicitly wherever they occur.

---

## Task 1: Database schema, service-role client, and test tooling

**Files:**
- Modify: `supabase/schema.sql`
- Modify: `.env.local.example`
- Create: `src/lib/supabase/service.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (add `vitest`, `dotenv` devDependencies + `test` script)
- Create: `tests/helpers.ts`
- Create: `tests/schema.test.ts`

**Interfaces:**
- Produces: `createServiceClient(): SupabaseClient` from `src/lib/supabase/service.ts` — used by every later Server Action that needs to bypass RLS for student-side operations.
- Produces (in `tests/helpers.ts`): `getServiceClient()`, `getAnonClient()`, `createTestStudentIdentity(): Promise<string>`, `deleteTestStudentIdentity(id)`, `createTestUser(role: "kader"|"guru", opts?: {verified?: boolean}): Promise<{id, email, password}>`, `deleteTestUser(id)`, `signInTestUser(email, password): Promise<{client, session}>` — reused by every later test file.

- [ ] **Step 1: Rewrite `supabase/schema.sql`**

Replace the entire file with:

```sql
-- =============================================================
-- Peer Counseling — Skema Database
-- Jalankan seluruh isi file ini di Supabase Dashboard > SQL Editor.
-- Aman dijalankan ulang (idempoten sebisa mungkin).
-- =============================================================

-- -------------------------------------------------------------
-- 1. Enum
-- -------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('kader', 'guru');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'topic') then
    create type public.topic as enum (
      'pertemanan', 'bullying', 'keluarga', 'akademik',
      'perasaan', 'lingkungan_sekolah', 'lainnya'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'kader_status') then
    create type public.kader_status as enum ('available', 'busy', 'offline');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'session_status') then
    create type public.session_status as enum ('waiting', 'active', 'escalated', 'ended');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'sender_role') then
    create type public.sender_role as enum ('student', 'kader', 'guru', 'system');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'escalation_status') then
    create type public.escalation_status as enum ('pending', 'acknowledged', 'resolved');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_reason') then
    create type public.report_reason as enum ('uncomfortable', 'unresponsive', 'need_teacher', 'other');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type public.report_status as enum ('open', 'reviewed');
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'assignment_reason') then
    create type public.assignment_reason as enum ('assign', 'transfer', 'takeover');
  end if;
end$$;

-- -------------------------------------------------------------
-- 2. Tabel profiles (kader & guru; referensi auth.users)
-- -------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role public.app_role not null default 'kader',
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists bio text,
  add column if not exists topics public.topic[];

alter table public.profiles
  add column if not exists status public.kader_status not null default 'offline';

alter table public.profiles enable row level security;

-- -------------------------------------------------------------
-- 3. Helper: apakah user saat ini seorang guru?
-- -------------------------------------------------------------
create or replace function public.is_guru()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'guru'
  );
$$;

-- -------------------------------------------------------------
-- 4. Trigger: auto-buat profile saat user baru signup
-- -------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(
      (new.raw_user_meta_data ->> 'role')::public.app_role,
      'kader'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -------------------------------------------------------------
-- 5. Drop tabel lama (skema awal, sebelum redesign)
-- -------------------------------------------------------------
drop table if exists public.counseling_sessions;

-- -------------------------------------------------------------
-- 6. Tabel student_identities
--    id di sini ADALAH local_id yang disimpan di localStorage
--    browser siswa. Dibuat lewat Server Action (service_role),
--    tidak pernah langsung dari klien.
-- -------------------------------------------------------------
create table if not exists public.student_identities (
  id uuid primary key default gen_random_uuid(),
  nickname text,
  avatar_seed text,
  created_at timestamptz not null default now()
);

alter table public.student_identities enable row level security;
-- Sengaja TANPA policy dan TANPA grant ke anon/authenticated:
-- hanya service_role (Server Action) yang boleh menyentuh tabel ini.

-- -------------------------------------------------------------
-- 7. Tabel sessions
-- -------------------------------------------------------------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  student_local_id uuid not null references public.student_identities (id) on delete cascade,
  assigned_to uuid references public.profiles (id) on delete set null,
  topic public.topic not null,
  status public.session_status not null default 'waiting',
  started_at timestamptz,
  ended_at timestamptz,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

-- -------------------------------------------------------------
-- 8. Tabel messages
-- -------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  sender_role public.sender_role not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.messages enable row level security;

-- -------------------------------------------------------------
-- 9. Tabel session_assignments (audit: assign/transfer/takeover)
-- -------------------------------------------------------------
create table if not exists public.session_assignments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  from_id uuid references public.profiles (id) on delete set null,
  to_id uuid not null references public.profiles (id) on delete cascade,
  changed_by uuid not null references public.profiles (id) on delete cascade,
  reason public.assignment_reason not null,
  created_at timestamptz not null default now()
);

alter table public.session_assignments enable row level security;

-- -------------------------------------------------------------
-- 10. Tabel escalations
-- -------------------------------------------------------------
create table if not exists public.escalations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  kader_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  status public.escalation_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz
);

alter table public.escalations enable row level security;

-- -------------------------------------------------------------
-- 11. Tabel session_reports
-- -------------------------------------------------------------
create table if not exists public.session_reports (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  reason public.report_reason not null,
  details text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.session_reports enable row level security;
-- Sengaja TANPA grant ke anon (student menulis lewat Server Action +
-- service_role). Hanya guru yang boleh membaca (lihat policy di bawah).

-- -------------------------------------------------------------
-- 12. Trigger: escalations -> sessions.status = 'escalated'
-- -------------------------------------------------------------
create or replace function public.handle_new_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sessions set status = 'escalated' where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists on_escalation_created on public.escalations;
create trigger on_escalation_created
  after insert on public.escalations
  for each row execute procedure public.handle_new_escalation();

-- -------------------------------------------------------------
-- 13. Trigger: messages -> sessions.last_message_at
-- -------------------------------------------------------------
create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sessions set last_message_at = new.created_at where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute procedure public.handle_new_message();

-- -------------------------------------------------------------
-- 14. GRANTS
--     anon: TIDAK ADA grant sama sekali untuk sessions/messages/
--     student_identities/session_reports/escalations/session_assignments.
--     Semua akses sisi student lewat Server Action + service_role.
-- -------------------------------------------------------------
grant select, update on public.profiles to authenticated;
grant select on public.profiles to anon;

grant select, update on public.sessions to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert on public.session_assignments to authenticated;
grant select, insert, update on public.escalations to authenticated;
grant select, update on public.session_reports to authenticated;

-- -------------------------------------------------------------
-- 15. RLS POLICIES — profiles
-- -------------------------------------------------------------
drop policy if exists "profiles: baca profil sendiri" on public.profiles;
create policy "profiles: baca profil sendiri"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles: guru baca semua" on public.profiles;
create policy "profiles: guru baca semua"
  on public.profiles for select
  to authenticated
  using (public.is_guru());

drop policy if exists "profiles: update profil sendiri" on public.profiles;
create policy "profiles: update profil sendiri"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles: guru update semua" on public.profiles;
create policy "profiles: guru update semua"
  on public.profiles for update
  to authenticated
  using (public.is_guru())
  with check (public.is_guru());

-- -------------------------------------------------------------
-- 16. RLS POLICIES — sessions
-- -------------------------------------------------------------
drop policy if exists "sessions: kader baca sesi sendiri" on public.sessions;
create policy "sessions: kader baca sesi sendiri"
  on public.sessions for select
  to authenticated
  using (assigned_to = auth.uid());

drop policy if exists "sessions: guru baca semua" on public.sessions;
create policy "sessions: guru baca semua"
  on public.sessions for select
  to authenticated
  using (public.is_guru());

drop policy if exists "sessions: kader update sesi sendiri" on public.sessions;
create policy "sessions: kader update sesi sendiri"
  on public.sessions for update
  to authenticated
  using (assigned_to = auth.uid())
  with check (true);

drop policy if exists "sessions: guru update semua" on public.sessions;
create policy "sessions: guru update semua"
  on public.sessions for update
  to authenticated
  using (public.is_guru())
  with check (public.is_guru());

-- -------------------------------------------------------------
-- 17. RLS POLICIES — messages
-- -------------------------------------------------------------
drop policy if exists "messages: kader baca sesi sendiri" on public.messages;
create policy "messages: kader baca sesi sendiri"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = messages.session_id
        and s.assigned_to = auth.uid()
    )
  );

drop policy if exists "messages: guru baca semua" on public.messages;
create policy "messages: guru baca semua"
  on public.messages for select
  to authenticated
  using (public.is_guru());

drop policy if exists "messages: kader kirim di sesi sendiri" on public.messages;
create policy "messages: kader kirim di sesi sendiri"
  on public.messages for insert
  to authenticated
  with check (
    sender_role = 'kader'
    and exists (
      select 1 from public.sessions s
      where s.id = messages.session_id
        and s.assigned_to = auth.uid()
    )
  );

drop policy if exists "messages: guru kirim" on public.messages;
create policy "messages: guru kirim"
  on public.messages for insert
  to authenticated
  with check (sender_role = 'guru' and public.is_guru());

-- -------------------------------------------------------------
-- 18. RLS POLICIES — session_assignments
-- -------------------------------------------------------------
drop policy if exists "session_assignments: authenticated baca" on public.session_assignments;
create policy "session_assignments: authenticated baca"
  on public.session_assignments for select
  to authenticated
  using (true);

drop policy if exists "session_assignments: authenticated tulis" on public.session_assignments;
create policy "session_assignments: authenticated tulis"
  on public.session_assignments for insert
  to authenticated
  with check (changed_by = auth.uid());

-- -------------------------------------------------------------
-- 19. RLS POLICIES — escalations
-- -------------------------------------------------------------
drop policy if exists "escalations: kader buat di sesi sendiri" on public.escalations;
create policy "escalations: kader buat di sesi sendiri"
  on public.escalations for insert
  to authenticated
  with check (
    kader_id = auth.uid()
    and exists (
      select 1 from public.sessions s
      where s.id = escalations.session_id
        and s.assigned_to = auth.uid()
    )
  );

drop policy if exists "escalations: kader baca milik sendiri" on public.escalations;
create policy "escalations: kader baca milik sendiri"
  on public.escalations for select
  to authenticated
  using (kader_id = auth.uid());

drop policy if exists "escalations: guru baca semua" on public.escalations;
create policy "escalations: guru baca semua"
  on public.escalations for select
  to authenticated
  using (public.is_guru());

drop policy if exists "escalations: guru update" on public.escalations;
create policy "escalations: guru update"
  on public.escalations for update
  to authenticated
  using (public.is_guru())
  with check (public.is_guru());

-- -------------------------------------------------------------
-- 20. RLS POLICIES — session_reports (guru-only; student lewat service_role)
-- -------------------------------------------------------------
drop policy if exists "session_reports: guru baca" on public.session_reports;
create policy "session_reports: guru baca"
  on public.session_reports for select
  to authenticated
  using (public.is_guru());

drop policy if exists "session_reports: guru update" on public.session_reports;
create policy "session_reports: guru update"
  on public.session_reports for update
  to authenticated
  using (public.is_guru())
  with check (public.is_guru());

-- -------------------------------------------------------------
-- 21. Backfill profile untuk user yang sudah ada (jika ada)
-- -------------------------------------------------------------
insert into public.profiles (id, full_name, role)
select
  u.id,
  u.raw_user_meta_data ->> 'full_name',
  coalesce((u.raw_user_meta_data ->> 'role')::public.app_role, 'kader')
from auth.users u
on conflict (id) do nothing;
```

- [ ] **Step 2 (manual — human): run the schema in Supabase**

Open the Supabase Dashboard for this project → SQL Editor → paste the full contents of `supabase/schema.sql` → Run. Confirm it completes with no errors. This step cannot be automated by the engineer executing this plan (no DB credentials/CLI access) — stop and wait for the human to confirm this is done before continuing.

- [ ] **Step 3 (manual — human): add the service-role key**

In the Supabase Dashboard → Project Settings → API, copy the `service_role` secret key. Add it to `.env.local` (create the file from `.env.local.example` if it doesn't already have it) as:

```
SUPABASE_SERVICE_ROLE_KEY=<paste the secret here>
```

Do not paste the actual secret value into chat/commits — only into the local `.env.local` file, which is gitignored.

- [ ] **Step 4: Update `.env.local.example`**

```
# Supabase — ambil dari Project Settings > API di dashboard Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# Service role key — server-only, JANGAN pernah diawali NEXT_PUBLIC_ atau
# diimpor dari Client Component. Dipakai lewat src/lib/supabase/service.ts.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- [ ] **Step 5: Create `src/lib/supabase/service.ts`**

```ts
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client sisi server dengan service role key — melewati RLS.
 * HANYA dipakai di dalam file "use server" (Server Actions) atau Route
 * Handler. JANGAN pernah diimpor dari Client Component.
 */
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
```

- [ ] **Step 6: Add test tooling to `package.json`**

Run:

```bash
npm install --save-dev vitest dotenv
```

Then add a `"test"` script next to the existing `scripts`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run"
}
```

- [ ] **Step 7: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

export default defineConfig({
  test: {
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 8: Create `tests/helpers.ts`**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name} — needed for integration tests`);
  }
  return value;
}

export function getServiceClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export function getAnonClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function createTestStudentIdentity(): Promise<string> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("student_identities")
    .insert({ nickname: "Test Siswa" })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("insert failed");
  return data.id as string;
}

export async function deleteTestStudentIdentity(id: string): Promise<void> {
  const service = getServiceClient();
  await service.from("student_identities").delete().eq("id", id);
}

let testUserCounter = 0;

export async function createTestUser(
  role: "kader" | "guru",
  opts: { verified?: boolean } = {},
): Promise<{ id: string; email: string; password: string }> {
  const service = getServiceClient();
  testUserCounter += 1;
  const email = `test-${role}-${Date.now()}-${testUserCounter}@example.test`;
  const password = "Test1234!";
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Test ${role}`, role },
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const userId = data.user.id;
  if (opts.verified) {
    await service.from("profiles").update({ is_verified: true }).eq("id", userId);
  }
  return { id: userId, email, password };
}

export async function deleteTestUser(id: string): Promise<void> {
  const service = getServiceClient();
  await service.auth.admin.deleteUser(id);
}

export async function signInTestUser(
  email: string,
  password: string,
): Promise<{ client: SupabaseClient }> {
  const anon = getAnonClient();
  const { error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client: anon };
}
```

- [ ] **Step 9: Create `tests/schema.test.ts`**

```ts
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
    const kaderA = await createTestUser("kader", { verified: true });
    const kaderB = await createTestUser("kader", { verified: true });
    const localId = await createTestStudentIdentity();
    const service = getServiceClient();
    const { data: session, error: sessionError } = await service
      .from("sessions")
      .insert({ student_local_id: localId, assigned_to: kaderA.id, topic: "akademik" })
      .select("id")
      .single();
    expect(sessionError).toBeNull();

    try {
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
      await service.from("sessions").delete().eq("id", session!.id);
      await deleteTestStudentIdentity(localId);
      await deleteTestUser(kaderA.id);
      await deleteTestUser(kaderB.id);
    }
  });

  it("a guru can see any session", async () => {
    const kader = await createTestUser("kader", { verified: true });
    const guru = await createTestUser("guru", { verified: true });
    const localId = await createTestStudentIdentity();
    const service = getServiceClient();
    const { data: session } = await service
      .from("sessions")
      .insert({ student_local_id: localId, assigned_to: kader.id, topic: "bullying" })
      .select("id")
      .single();

    try {
      const { client: asGuru } = await signInTestUser(guru.email, guru.password);
      const { data: seenByGuru } = await asGuru
        .from("sessions")
        .select("id")
        .eq("id", session!.id);
      expect(seenByGuru).toHaveLength(1);
    } finally {
      await service.from("sessions").delete().eq("id", session!.id);
      await deleteTestStudentIdentity(localId);
      await deleteTestUser(kader.id);
      await deleteTestUser(guru.id);
    }
  });
});
```

- [ ] **Step 10: Run the tests**

Run: `npm run test`
Expected: all `schema.test.ts` tests PASS. If any `42501` assertions fail, re-check that Step 2 actually ran against the right project (compare `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` to the dashboard project).

- [ ] **Step 11: Commit**

```bash
git add supabase/schema.sql .env.local.example src/lib/supabase/service.ts vitest.config.ts package.json package-lock.json tests/helpers.ts tests/schema.test.ts
git commit -m "feat: rewrite schema for sessions/messages/escalations, add service-role client and test tooling"
```

---

## Task 2: Design system tokens and shared primitives

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Create: `src/lib/cn.ts`
- Create: `src/components/ui/Button.tsx`
- Create: `src/components/ui/Card.tsx`
- Create: `src/components/ui/Chip.tsx`
- Create: `src/components/ui/Modal.tsx`
- Create (temporary, deleted at end of task): `src/app/dev-preview/page.tsx`

**Interfaces:**
- Produces: `cn(...classes)` from `src/lib/cn.ts`; `<Button variant="primary"|"secondary"|"ghost">`, `<Card>`, `<Chip tone="primary"|"secondary"|"tertiary"|"error"|"neutral">`, `<Modal open onClose title description? children? footer?>` from `src/components/ui/*` — used by every later task's UI.

- [ ] **Step 1: Replace `src/app/globals.css`**

```css
@import "tailwindcss";

:root {
  --surface: #f8f9fa;
  --surface-dim: #d9dadb;
  --surface-bright: #f8f9fa;
  --surface-container-lowest: #ffffff;
  --surface-container-low: #f3f4f5;
  --surface-container: #edeeef;
  --surface-container-high: #e7e8e9;
  --surface-container-highest: #e1e3e4;
  --on-surface: #191c1d;
  --on-surface-variant: #414751;
  --inverse-surface: #2e3132;
  --inverse-on-surface: #f0f1f2;
  --outline: #717783;
  --outline-variant: #c1c7d3;
  --primary: #005da7;
  --on-primary: #ffffff;
  --primary-container: #2976c7;
  --on-primary-container: #fdfcff;
  --inverse-primary: #a4c9ff;
  --secondary: #006398;
  --on-secondary: #ffffff;
  --secondary-container: #6cbdfe;
  --on-secondary-container: #004b75;
  --tertiary: #4c5f66;
  --on-tertiary: #ffffff;
  --tertiary-container: #65777f;
  --on-tertiary-container: #fafdff;
  --error: #ba1a1a;
  --on-error: #ffffff;
  --error-container: #ffdad6;
  --on-error-container: #93000a;
  --primary-fixed: #d4e3ff;
  --primary-fixed-dim: #a4c9ff;
  --on-primary-fixed: #001c39;
  --on-primary-fixed-variant: #004883;
  --secondary-fixed: #cde5ff;
  --secondary-fixed-dim: #94ccff;
  --on-secondary-fixed: #001d32;
  --on-secondary-fixed-variant: #004b74;
  --tertiary-fixed: #d2e6ef;
  --tertiary-fixed-dim: #b6cad2;
  --on-tertiary-fixed: #0b1e24;
  --on-tertiary-fixed-variant: #374951;
  --background: #f8f9fa;
  --on-background: #191c1d;
  --surface-variant: #e1e3e4;
}

@theme inline {
  --color-surface: var(--surface);
  --color-surface-dim: var(--surface-dim);
  --color-surface-bright: var(--surface-bright);
  --color-surface-container-lowest: var(--surface-container-lowest);
  --color-surface-container-low: var(--surface-container-low);
  --color-surface-container: var(--surface-container);
  --color-surface-container-high: var(--surface-container-high);
  --color-surface-container-highest: var(--surface-container-highest);
  --color-on-surface: var(--on-surface);
  --color-on-surface-variant: var(--on-surface-variant);
  --color-inverse-surface: var(--inverse-surface);
  --color-inverse-on-surface: var(--inverse-on-surface);
  --color-outline: var(--outline);
  --color-outline-variant: var(--outline-variant);
  --color-primary: var(--primary);
  --color-on-primary: var(--on-primary);
  --color-primary-container: var(--primary-container);
  --color-on-primary-container: var(--on-primary-container);
  --color-inverse-primary: var(--inverse-primary);
  --color-secondary: var(--secondary);
  --color-on-secondary: var(--on-secondary);
  --color-secondary-container: var(--secondary-container);
  --color-on-secondary-container: var(--on-secondary-container);
  --color-tertiary: var(--tertiary);
  --color-on-tertiary: var(--on-tertiary);
  --color-tertiary-container: var(--tertiary-container);
  --color-on-tertiary-container: var(--on-tertiary-container);
  --color-error: var(--error);
  --color-on-error: var(--on-error);
  --color-error-container: var(--error-container);
  --color-on-error-container: var(--on-error-container);
  --color-primary-fixed: var(--primary-fixed);
  --color-primary-fixed-dim: var(--primary-fixed-dim);
  --color-on-primary-fixed: var(--on-primary-fixed);
  --color-on-primary-fixed-variant: var(--on-primary-fixed-variant);
  --color-secondary-fixed: var(--secondary-fixed);
  --color-secondary-fixed-dim: var(--secondary-fixed-dim);
  --color-on-secondary-fixed: var(--on-secondary-fixed);
  --color-on-secondary-fixed-variant: var(--on-secondary-fixed-variant);
  --color-tertiary-fixed: var(--tertiary-fixed);
  --color-tertiary-fixed-dim: var(--tertiary-fixed-dim);
  --color-on-tertiary-fixed: var(--on-tertiary-fixed);
  --color-on-tertiary-fixed-variant: var(--on-tertiary-fixed-variant);
  --color-background: var(--background);
  --color-on-background: var(--on-background);
  --color-surface-variant: var(--surface-variant);

  --font-sans: var(--font-plus-jakarta-sans), "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif;

  --radius-sm: 0.25rem;
  --radius-md: 0.75rem;
  --radius-lg: 1rem;
  --radius-xl: 1.5rem;

  --spacing-xs: 8px;
  --spacing-sm: 16px;
  --spacing-md: 24px;
  --spacing-lg: 40px;
  --spacing-xl: 64px;
  --spacing-gutter: 20px;

  --text-headline-lg: 32px;
  --text-headline-lg--line-height: 40px;
  --text-headline-lg--letter-spacing: -0.02em;
  --text-headline-lg-mobile: 24px;
  --text-headline-lg-mobile--line-height: 32px;
  --text-headline-lg-mobile--letter-spacing: -0.01em;
  --text-headline-md: 20px;
  --text-headline-md--line-height: 28px;
  --text-body-lg: 18px;
  --text-body-lg--line-height: 28px;
  --text-body-md: 16px;
  --text-body-md--line-height: 24px;
  --text-label-md: 14px;
  --text-label-md--line-height: 20px;
  --text-label-md--letter-spacing: 0.01em;
  --text-label-sm: 12px;
  --text-label-sm--line-height: 16px;
}

body {
  background: var(--background);
  color: var(--on-background);
  font-family: var(--font-sans);
}
```

- [ ] **Step 2: Update `src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ruang Cerita",
  description: "Peer counseling untuk siswa — aman, anonim, dan didampingi.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${plusJakartaSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Create `src/lib/cn.ts`**

```ts
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
```

- [ ] **Step 4: Create `src/components/ui/Button.tsx`**

```tsx
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-container",
  secondary: "bg-secondary-container text-on-secondary-container",
  ghost: "bg-transparent text-on-surface border border-outline-variant",
};

export function Button({ variant = "primary", className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-label-md font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 5: Create `src/components/ui/Card.tsx`**

```tsx
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-outline-variant bg-surface-container-lowest p-md",
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 6: Create `src/components/ui/Chip.tsx`**

```tsx
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ChipTone = "primary" | "secondary" | "tertiary" | "error" | "neutral";

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
};

const toneClasses: Record<ChipTone, string> = {
  primary: "bg-primary-fixed text-on-primary-fixed",
  secondary: "bg-secondary-fixed text-on-secondary-fixed",
  tertiary: "bg-tertiary-fixed text-on-tertiary-fixed",
  error: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-high text-on-surface-variant",
};

export function Chip({ tone = "neutral", className, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-label-sm font-medium",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
```

- [ ] **Step 7: Create `src/components/ui/Modal.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
};

export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative w-full max-w-sm rounded-xl bg-surface-container-lowest p-md shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup"
          className="absolute right-4 top-4 text-on-surface-variant"
        >
          ✕
        </button>
        <h2 id="modal-title" className="text-headline-md font-semibold text-on-surface">
          {title}
        </h2>
        {description && (
          <p className="mt-2 text-body-md text-on-surface-variant">{description}</p>
        )}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create a temporary preview page and check it in the browser**

Create `src/app/dev-preview/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";

export default function DevPreviewPage() {
  const [open, setOpen] = useState(false);

  return (
    <main className="flex min-h-screen flex-col gap-6 bg-surface p-lg">
      <div className="flex gap-3">
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
      </div>
      <Card>
        <p className="text-body-md text-on-surface">Contoh Card</p>
      </Card>
      <div className="flex gap-2">
        <Chip tone="primary">Pertemanan</Chip>
        <Chip tone="secondary">Akademik</Chip>
        <Chip tone="error">Eskalasi</Chip>
      </div>
      <Button onClick={() => setOpen(true)}>Buka Modal</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Contoh Modal"
        description="Ini teks deskripsi modal."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button onClick={() => setOpen(false)}>Konfirmasi</Button>
          </>
        }
      />
    </main>
  );
}
```

Run: `npm run dev`, open `http://localhost:3000/dev-preview`.
Expected: Plus Jakarta Sans font loads, buttons show the three variants in the design system's blue/light-blue/ghost styles, the card has a 16px-radius white surface with a 1px border, chips are pill-shaped, and clicking "Buka Modal" opens a centered modal that closes on the ✕ or either footer button.

- [ ] **Step 9: Delete the temporary preview**

```bash
rm -rf src/app/dev-preview
```

- [ ] **Step 10: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/lib/cn.ts src/components/ui/Button.tsx src/components/ui/Card.tsx src/components/ui/Chip.tsx src/components/ui/Modal.tsx
git commit -m "feat: add Ruang Cerita design tokens and shared UI primitives"
```

---

## Task 3: Realtime chat transport

**Files:**
- Create: `src/lib/chat/types.ts`
- Create: `src/lib/chat/core.ts`
- Create: `src/lib/chat/actions.ts`
- Create: `src/lib/chat/useSessionChat.ts`
- Create: `src/components/ui/ChatBubble.tsx`
- Modify: `tests/helpers.ts` (add `createTestSession`/`deleteTestSession`, wire `ws` transport for Realtime in Node)
- Modify: `package.json` (add `ws`, `@types/ws` devDependencies)
- Create: `tests/chat.test.ts`

**Interfaces:**
- Consumes: `createServiceClient()` (Task 1), `createClient()` from `src/lib/supabase/server.ts` and `src/lib/supabase/client.ts` (pre-existing).
- Produces: `sendMessageCore(supabase, { sessionId, body, actor }): Promise<ChatMessage>`, `getSessionMessagesCore(supabase, { sessionId, actor }): Promise<ChatMessage[]>`, `sessionChannelName(sessionId): string` from `src/lib/chat/core.ts`; `sendMessage(input)`, `getSessionMessages(input)` Server Actions from `src/lib/chat/actions.ts`; `useSessionChat(sessionId, studentLocalId?)` hook returning `{ messages, typingFrom, send, notifyTyping }`; `<ChatBubble senderRole body timestamp viewerRole>` — all reused unmodified by the Student, Kader, and Guru portal plans.

- [ ] **Step 1: Create `src/lib/chat/types.ts`**

```ts
export type SenderRole = "student" | "kader" | "guru" | "system";

export type ChatMessage = {
  id: string;
  sessionId: string;
  senderRole: SenderRole;
  body: string;
  createdAt: string;
};

export type ChatActor =
  | { kind: "student"; studentLocalId: string }
  | { kind: "kader"; userId: string }
  | { kind: "guru"; userId: string };
```

- [ ] **Step 2: Create `src/lib/chat/core.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatActor, ChatMessage } from "./types";

export function sessionChannelName(sessionId: string): string {
  return `session:${sessionId}`;
}

async function assertActorCanAccessSession(
  supabase: SupabaseClient,
  sessionId: string,
  actor: ChatActor,
) {
  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, student_local_id, assigned_to")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    throw new Error("Sesi tidak ditemukan");
  }

  if (actor.kind === "student" && session.student_local_id !== actor.studentLocalId) {
    throw new Error("Tidak diizinkan mengakses sesi ini");
  }

  if (actor.kind === "kader" && session.assigned_to !== actor.userId) {
    throw new Error("Tidak diizinkan mengakses sesi ini");
  }

  return session;
}

export async function sendMessageCore(
  supabase: SupabaseClient,
  input: { sessionId: string; body: string; actor: ChatActor },
): Promise<ChatMessage> {
  await assertActorCanAccessSession(supabase, input.sessionId, input.actor);

  const { data, error } = await supabase
    .from("messages")
    .insert({
      session_id: input.sessionId,
      sender_role: input.actor.kind,
      body: input.body,
    })
    .select("id, session_id, sender_role, body, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Gagal mengirim pesan");
  }

  const message: ChatMessage = {
    id: data.id,
    sessionId: data.session_id,
    senderRole: data.sender_role,
    body: data.body,
    createdAt: data.created_at,
  };

  await supabase.channel(sessionChannelName(input.sessionId)).send({
    type: "broadcast",
    event: "new_message",
    payload: message,
  });

  return message;
}

export async function getSessionMessagesCore(
  supabase: SupabaseClient,
  input: { sessionId: string; actor: ChatActor },
): Promise<ChatMessage[]> {
  await assertActorCanAccessSession(supabase, input.sessionId, input.actor);

  const { data, error } = await supabase
    .from("messages")
    .select("id, session_id, sender_role, body, created_at")
    .eq("session_id", input.sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: row.created_at,
  }));
}
```

- [ ] **Step 3: Create `src/lib/chat/actions.ts`**

```ts
"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendMessageCore, getSessionMessagesCore } from "./core";
import type { ChatActor, ChatMessage } from "./types";

async function resolveStaffActor(): Promise<ChatActor> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Anda harus login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "guru") {
    return { kind: "guru", userId: user.id };
  }
  return { kind: "kader", userId: user.id };
}

export async function sendMessage(input: {
  sessionId: string;
  body: string;
  studentLocalId?: string;
}): Promise<ChatMessage> {
  if (input.studentLocalId) {
    const service = createServiceClient();
    return sendMessageCore(service, {
      sessionId: input.sessionId,
      body: input.body,
      actor: { kind: "student", studentLocalId: input.studentLocalId },
    });
  }

  const actor = await resolveStaffActor();
  const supabase = await createClient();
  return sendMessageCore(supabase, {
    sessionId: input.sessionId,
    body: input.body,
    actor,
  });
}

export async function getSessionMessages(input: {
  sessionId: string;
  studentLocalId?: string;
}): Promise<ChatMessage[]> {
  if (input.studentLocalId) {
    const service = createServiceClient();
    return getSessionMessagesCore(service, {
      sessionId: input.sessionId,
      actor: { kind: "student", studentLocalId: input.studentLocalId },
    });
  }

  const actor = await resolveStaffActor();
  const supabase = await createClient();
  return getSessionMessagesCore(supabase, {
    sessionId: input.sessionId,
    actor,
  });
}
```

- [ ] **Step 4: Create `src/lib/chat/useSessionChat.ts`**

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessage, getSessionMessages } from "./actions";
import { sessionChannelName } from "./core";
import type { ChatMessage } from "./types";

export function useSessionChat(sessionId: string, studentLocalId?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingFrom, setTypingFrom] = useState<string | null>(null);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    let active = true;
    getSessionMessages({ sessionId, studentLocalId }).then((history) => {
      if (active) setMessages(history);
    });

    const channel = supabaseRef.current
      .channel(sessionChannelName(sessionId))
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        setMessages((current) => [...current, payload as ChatMessage]);
      })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { senderRole } = payload as { senderRole: string };
        setTypingFrom(senderRole);
        setTimeout(() => setTypingFrom(null), 3000);
      })
      .subscribe();

    return () => {
      active = false;
      supabaseRef.current.removeChannel(channel);
    };
  }, [sessionId, studentLocalId]);

  const send = useCallback(
    (body: string) => sendMessage({ sessionId, body, studentLocalId }),
    [sessionId, studentLocalId],
  );

  const notifyTyping = useCallback(
    (senderRole: string) => {
      supabaseRef.current.channel(sessionChannelName(sessionId)).send({
        type: "broadcast",
        event: "typing",
        payload: { senderRole },
      });
    },
    [sessionId],
  );

  return { messages, typingFrom, send, notifyTyping };
}
```

- [ ] **Step 5: Create `src/components/ui/ChatBubble.tsx`**

```tsx
import { cn } from "@/lib/cn";
import type { SenderRole } from "@/lib/chat/types";

type ChatBubbleProps = {
  senderRole: SenderRole;
  body: string;
  timestamp: string;
  viewerRole: SenderRole;
};

export function ChatBubble({ senderRole, body, timestamp, viewerRole }: ChatBubbleProps) {
  const isOwn = senderRole === viewerRole;

  return (
    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-4 py-2.5 text-body-md",
          isOwn
            ? "rounded-br-sm bg-primary text-on-primary"
            : "rounded-bl-sm bg-surface-container-high text-on-surface",
        )}
      >
        <p>{body}</p>
        <p
          className={cn(
            "mt-1 text-label-sm",
            isOwn ? "text-on-primary/70" : "text-on-surface-variant",
          )}
        >
          {timestamp}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add `ws` devDependencies**

Run:

```bash
npm install --save-dev ws @types/ws
```

- [ ] **Step 7: Update `tests/helpers.ts` to use a Node WebSocket transport for Realtime, and add session fixtures**

Add the import at the top:

```ts
import WebSocket from "ws";
```

Change `getServiceClient` and `getAnonClient` to pass the transport (keep everything else in the file unchanged):

```ts
export function getServiceClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    },
  );
}

export function getAnonClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    },
  );
}
```

Append these two functions to the end of the file:

```ts
export async function createTestSession(input: {
  studentLocalId: string;
  assignedTo?: string;
  topic?: string;
}): Promise<string> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("sessions")
    .insert({
      student_local_id: input.studentLocalId,
      assigned_to: input.assignedTo ?? null,
      topic: input.topic ?? "akademik",
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("insert failed");
  return data.id as string;
}

export async function deleteTestSession(id: string): Promise<void> {
  const service = getServiceClient();
  await service.from("messages").delete().eq("session_id", id);
  await service.from("sessions").delete().eq("id", id);
}
```

- [ ] **Step 8: Create `tests/chat.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { sendMessageCore, getSessionMessagesCore, sessionChannelName } from "@/lib/chat/core";
import {
  getServiceClient,
  createTestStudentIdentity,
  deleteTestStudentIdentity,
  createTestSession,
  deleteTestSession,
  createTestUser,
  deleteTestUser,
} from "./helpers";

describe("chat core: permission checks", () => {
  it("a student can send and read messages in their own session", async () => {
    const service = getServiceClient();
    const localId = await createTestStudentIdentity();
    const sessionId = await createTestSession({ studentLocalId: localId });

    try {
      await sendMessageCore(service, {
        sessionId,
        body: "Halo, aku butuh bantuan",
        actor: { kind: "student", studentLocalId: localId },
      });

      const history = await getSessionMessagesCore(service, {
        sessionId,
        actor: { kind: "student", studentLocalId: localId },
      });

      expect(history).toHaveLength(1);
      expect(history[0].body).toBe("Halo, aku butuh bantuan");
      expect(history[0].senderRole).toBe("student");
    } finally {
      await deleteTestSession(sessionId);
      await deleteTestStudentIdentity(localId);
    }
  });

  it("rejects a student actor whose local id does not own the session", async () => {
    const service = getServiceClient();
    const localId = await createTestStudentIdentity();
    const otherLocalId = await createTestStudentIdentity();
    const sessionId = await createTestSession({ studentLocalId: localId });

    try {
      await expect(
        sendMessageCore(service, {
          sessionId,
          body: "curious",
          actor: { kind: "student", studentLocalId: otherLocalId },
        }),
      ).rejects.toThrow("Tidak diizinkan");
    } finally {
      await deleteTestSession(sessionId);
      await deleteTestStudentIdentity(localId);
      await deleteTestStudentIdentity(otherLocalId);
    }
  });

  it("rejects a kader actor who is not assigned to the session", async () => {
    const service = getServiceClient();
    const kaderA = await createTestUser("kader", { verified: true });
    const kaderB = await createTestUser("kader", { verified: true });
    const localId = await createTestStudentIdentity();
    const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: kaderA.id });

    try {
      await expect(
        sendMessageCore(service, {
          sessionId,
          body: "aku bukan yang ditugaskan",
          actor: { kind: "kader", userId: kaderB.id },
        }),
      ).rejects.toThrow("Tidak diizinkan");
    } finally {
      await deleteTestSession(sessionId);
      await deleteTestStudentIdentity(localId);
      await deleteTestUser(kaderA.id);
      await deleteTestUser(kaderB.id);
    }
  });
});

describe("chat core: realtime broadcast delivery", () => {
  it("delivers a sent message to a listener subscribed on the session channel", async () => {
    const service = getServiceClient();
    const localId = await createTestStudentIdentity();
    const sessionId = await createTestSession({ studentLocalId: localId });
    const listener = getServiceClient();

    let resolveReceived: (value: { body: string }) => void;
    const received = new Promise<{ body: string }>((resolve) => {
      resolveReceived = resolve;
    });

    const channel = listener
      .channel(sessionChannelName(sessionId))
      .on("broadcast", { event: "new_message" }, ({ payload }) => {
        resolveReceived(payload as { body: string });
      });

    await new Promise<void>((resolve, reject) => {
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") resolve();
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          reject(new Error(`channel subscribe failed: ${status}`));
        }
      });
    });

    try {
      await sendMessageCore(service, {
        sessionId,
        body: "pesan realtime",
        actor: { kind: "student", studentLocalId: localId },
      });

      const payload = await Promise.race([
        received,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timed out waiting for broadcast")), 8000),
        ),
      ]);
      expect(payload.body).toBe("pesan realtime");
    } finally {
      await listener.removeAllChannels();
      await deleteTestSession(sessionId);
      await deleteTestStudentIdentity(localId);
    }
  });
});
```

- [ ] **Step 9: Run the tests**

Run: `npm run test`
Expected: all `chat.test.ts` tests PASS, including the realtime delivery test (it may take a couple of seconds — that's the channel actually round-tripping through Supabase Realtime, not a mock).

- [ ] **Step 10: Commit**

```bash
git add src/lib/chat src/components/ui/ChatBubble.tsx tests/helpers.ts tests/chat.test.ts package.json package-lock.json
git commit -m "feat: add shared realtime chat transport (broadcast-based, all roles)"
```

---

## Task 4: Shared app shell layout

**Files:**
- Create: `src/components/shells/AppShell.tsx`
- Create: `src/components/shells/StudentShell.tsx`
- Create: `src/components/shells/KaderShell.tsx`
- Create: `src/components/shells/GuruShell.tsx`

**Interfaces:**
- Consumes: `cn` (Task 2).
- Produces: `NavItem` type and `<StudentShell navItems primaryAction? children>`, `<KaderShell ...>`, `<GuruShell ...>` — used by the kader/guru layouts in Task 6, and by the Student/Kader/Guru portal plans.

- [ ] **Step 1: Create `src/components/shells/AppShell.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

type AppShellProps = {
  title: string;
  navItems: NavItem[];
  primaryAction?: ReactNode;
  children: ReactNode;
};

export function AppShell({ title, navItems, primaryAction, children }: AppShellProps) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden w-64 flex-col gap-6 border-r border-outline-variant bg-surface-container-low p-md md:flex">
        <div>
          <p className="text-headline-md font-bold text-on-surface">Ruang Cerita</p>
          <p className="text-label-sm text-on-surface-variant">{title}</p>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-label-md",
                isActive(item.href)
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface-variant hover:bg-surface-container",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
        {primaryAction && <div className="mt-auto">{primaryAction}</div>}
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-sm py-3 md:hidden">
          <p className="text-headline-md font-bold text-on-surface">Ruang Cerita</p>
        </header>

        <main className="flex-1 p-sm md:p-lg">{children}</main>

        <nav className="flex items-center justify-around border-t border-outline-variant bg-surface-container-lowest p-2 md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md px-3 py-1 text-label-sm",
                isActive(item.href) ? "text-primary" : "text-on-surface-variant",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the three role wrappers**

`src/components/shells/StudentShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { AppShell, type NavItem } from "./AppShell";

type RoleShellProps = {
  navItems: NavItem[];
  primaryAction?: ReactNode;
  children: ReactNode;
};

export function StudentShell(props: RoleShellProps) {
  return <AppShell title="Area Siswa" {...props} />;
}
```

`src/components/shells/KaderShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { AppShell, type NavItem } from "./AppShell";

type RoleShellProps = {
  navItems: NavItem[];
  primaryAction?: ReactNode;
  children: ReactNode;
};

export function KaderShell(props: RoleShellProps) {
  return <AppShell title="Area Kader" {...props} />;
}
```

`src/components/shells/GuruShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { AppShell, type NavItem } from "./AppShell";

type RoleShellProps = {
  navItems: NavItem[];
  primaryAction?: ReactNode;
  children: ReactNode;
};

export function GuruShell(props: RoleShellProps) {
  return <AppShell title="Area Guru BK" {...props} />;
}
```

- [ ] **Step 3: Manually verify in the browser**

Temporarily create `src/app/dev-preview/page.tsx`:

```tsx
import { KaderShell } from "@/components/shells/KaderShell";

export default function DevPreviewPage() {
  return (
    <KaderShell
      navItems={[
        { href: "/dev-preview", label: "Beranda", icon: "🏠" },
        { href: "/dev-preview/lain", label: "Profil", icon: "🙂" },
      ]}
    >
      <p className="text-body-md text-on-surface">Konten contoh di dalam shell.</p>
    </KaderShell>
  );
}
```

Run: `npm run dev`, open `http://localhost:3000/dev-preview`.
Expected: desktop viewport shows a left sidebar with "Ruang Cerita" / "Area Kader" and the two nav items, "Beranda" highlighted (current path matches); shrinking the viewport below Tailwind's `md` breakpoint switches to a top bar + bottom nav instead of the sidebar.

Then delete it: `rm -rf src/app/dev-preview`

- [ ] **Step 4: Commit**

```bash
git add src/components/shells
git commit -m "feat: add shared AppShell and per-role shell wrappers"
```

---

## Task 5: Kader & guru login pages

**Files:**
- Create: `src/lib/auth/types.ts`
- Create: `src/lib/auth/actions.ts`
- Create: `src/app/kader/login/page.tsx`
- Create: `src/app/guru/login/page.tsx`
- Delete: `src/app/login/page.tsx`, `src/app/login/actions.ts`

**Interfaces:**
- Consumes: `Button`, `Card` (Task 2); `createClient()` from `src/lib/supabase/server.ts` (pre-existing).
- Produces: `login(formData)`, `signupKader(formData)`, `signupGuru(formData)`, `signout()`, `verifyKader(formData)` from `src/lib/auth/actions.ts` — used by Task 6's layouts (`signout`) and later by the kader/guru portal plans (`verifyKader` on the guru dashboard).

- [ ] **Step 1: Create `src/lib/auth/types.ts`**

```ts
export type AppRole = "kader" | "guru";
```

- [ ] **Step 2: Create `src/lib/auth/actions.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "./types";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const loginPath = (formData.get("redirect_to") as string) || "/kader/login";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`${loginPath}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(loginPath === "/guru/login" ? "/guru" : "/kader");
}

async function signupAs(role: AppRole, formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = (formData.get("full_name") as string) ?? "";
  const loginPath = role === "guru" ? "/guru/login" : "/kader/login";

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role },
    },
  });

  if (error) {
    redirect(`${loginPath}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(role === "guru" ? "/guru" : "/kader");
}

export async function signupKader(formData: FormData) {
  return signupAs("kader", formData);
}

export async function signupGuru(formData: FormData) {
  return signupAs("guru", formData);
}

export async function verifyKader(formData: FormData) {
  const supabase = await createClient();
  const kaderId = formData.get("kader_id") as string;

  await supabase.from("profiles").update({ is_verified: true }).eq("id", kaderId);

  revalidatePath("/", "layout");
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
```

- [ ] **Step 3: Create `src/app/kader/login/page.tsx`**

```tsx
import { login, signupKader } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function KaderLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-sm">
      <Card className="w-full max-w-sm">
        <h1 className="text-headline-md font-bold text-on-surface">Masuk sebagai Kader</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Untuk pendamping sebaya yang sudah terdaftar.
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-error-container px-3 py-2 text-label-md text-on-error-container">
            {error}
          </p>
        )}

        <form className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="redirect_to" value="/kader/login" />
          <label className="flex flex-col gap-1 text-label-md text-on-surface">
            Nama lengkap
            <input
              name="full_name"
              type="text"
              className="rounded-md border border-outline-variant px-3 py-2 text-body-md"
            />
          </label>
          <label className="flex flex-col gap-1 text-label-md text-on-surface">
            Email
            <input
              name="email"
              type="email"
              required
              className="rounded-md border border-outline-variant px-3 py-2 text-body-md"
            />
          </label>
          <label className="flex flex-col gap-1 text-label-md text-on-surface">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={6}
              className="rounded-md border border-outline-variant px-3 py-2 text-body-md"
            />
          </label>

          <div className="mt-2 flex gap-3">
            <Button formAction={login} className="flex-1">
              Masuk
            </Button>
            <Button formAction={signupKader} variant="secondary" className="flex-1">
              Daftar
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Create `src/app/guru/login/page.tsx`**

```tsx
import { login, signupGuru } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function GuruLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-sm">
      <Card className="w-full max-w-sm">
        <h1 className="text-headline-md font-bold text-on-surface">Masuk sebagai Guru BK</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Untuk guru BK yang memantau dan mendampingi.
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-error-container px-3 py-2 text-label-md text-on-error-container">
            {error}
          </p>
        )}

        <form className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="redirect_to" value="/guru/login" />
          <label className="flex flex-col gap-1 text-label-md text-on-surface">
            Nama lengkap
            <input
              name="full_name"
              type="text"
              className="rounded-md border border-outline-variant px-3 py-2 text-body-md"
            />
          </label>
          <label className="flex flex-col gap-1 text-label-md text-on-surface">
            Email
            <input
              name="email"
              type="email"
              required
              className="rounded-md border border-outline-variant px-3 py-2 text-body-md"
            />
          </label>
          <label className="flex flex-col gap-1 text-label-md text-on-surface">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={6}
              className="rounded-md border border-outline-variant px-3 py-2 text-body-md"
            />
          </label>

          <div className="mt-2 flex gap-3">
            <Button formAction={login} className="flex-1">
              Masuk
            </Button>
            <Button formAction={signupGuru} variant="secondary" className="flex-1">
              Daftar
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: Delete the old shared login route**

```bash
rm -rf src/app/login
```

- [ ] **Step 6: Manually verify in the browser**

Run: `npm run dev`.
1. Open `http://localhost:3000/kader/login`, sign up with a real-looking test email/password. Expect a redirect towards `/kader` (Task 6 will make that route exist properly — for now it 404s or shows nothing, that's expected until Task 6).
2. Open `http://localhost:3000/guru/login`, sign up similarly, expect a redirect towards `/guru`.
3. In the Supabase Dashboard → Table Editor → `profiles`, confirm two new rows exist with `role = 'kader'` and `role = 'guru'` respectively, matching the accounts just created.
4. Try logging in at `/kader/login` with a wrong password — expect the red error banner with Supabase's error message.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth src/app/kader/login src/app/guru/login
git rm -r src/app/login
git commit -m "feat: split kader/guru login into separate routes, restyle with design system"
```

---

## Task 6: Proxy rewrite, role/verification-gated layouts, callback update

**Files:**
- Modify: `src/lib/supabase/proxy.ts`
- Create: `src/app/kader/layout.tsx`
- Create: `src/app/kader/page.tsx`
- Create: `src/app/guru/layout.tsx`
- Create: `src/app/guru/page.tsx`
- Modify: `src/app/auth/callback/route.ts`

**Interfaces:**
- Consumes: `KaderShell`, `GuruShell` (Task 4); `createClient()` from `src/lib/supabase/server.ts`.
- Produces: working `/kader` and `/guru` route trees that the kader/guru portal plans will fill in with real dashboards in place of the placeholder `page.tsx` files.

- [ ] **Step 1: Rewrite `src/lib/supabase/proxy.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Me-refresh session Supabase pada setiap request dan meneruskan cookie
 * yang diperbarui ke request maupun response.
 *
 * Dipanggil dari `proxy.ts` (konvensi Next.js 16 pengganti middleware).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // PENTING: jangan menulis logika di antara createServerClient dan getUser().
  // getUser() memicu refresh token bila diperlukan.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Prefix yang boleh diakses TANPA login:
  // - /            : landing 3 pilihan peran
  // - /student     : area student anonymous (tanpa akun)
  // - /kader/login : login/daftar kader
  // - /guru/login  : login/daftar guru
  // - /auth        : callback OAuth/email confirmation
  const publicPrefixes = ["/student", "/kader/login", "/guru/login", "/auth"];
  const isPublicPath =
    pathname === "/" || publicPrefixes.some((prefix) => pathname.startsWith(prefix));

  // Ini hanya redirect optimistis (belum login sama sekali). Kecocokan role
  // (kader vs guru) dan status verifikasi dicek ulang dengan query DB di
  // masing-masing layout — proxy TIDAK cukup untuk itu (lihat catatan Next.js
  // 16: Server Actions di luar matcher proxy tidak ikut tersaring proxy).
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith("/guru") ? "/guru/login" : "/kader/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 2: Create `src/app/kader/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KaderShell } from "@/components/shells/KaderShell";

const navItems = [
  { href: "/kader", label: "Beranda", icon: "🏠" },
  { href: "/kader/profil", label: "Profil", icon: "🙂" },
];

export default async function KaderLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/kader/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_verified")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "kader") {
    redirect("/guru");
  }

  if (!profile.is_verified) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface p-sm">
        <div className="max-w-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-md text-center">
          <h1 className="text-headline-md font-bold text-on-surface">Menunggu verifikasi</h1>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Akun kader Anda belum diverifikasi oleh Guru BK. Silakan tunggu
            atau hubungi Guru BK di sekolah Anda.
          </p>
        </div>
      </main>
    );
  }

  return <KaderShell navItems={navItems}>{children}</KaderShell>;
}
```

- [ ] **Step 3: Create `src/app/kader/page.tsx`**

```tsx
export default function KaderHomePage() {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-md">
      <h1 className="text-headline-md font-bold text-on-surface">Beranda Kader</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Dashboard kader akan dibangun di sub-project berikutnya.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/guru/layout.tsx`**

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GuruShell } from "@/components/shells/GuruShell";

const navItems = [{ href: "/guru", label: "Beranda", icon: "🏠" }];

export default async function GuruLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/guru/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "guru") {
    redirect("/kader");
  }

  return <GuruShell navItems={navItems}>{children}</GuruShell>;
}
```

- [ ] **Step 5: Create `src/app/guru/page.tsx`**

```tsx
export default function GuruHomePage() {
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-md">
      <h1 className="text-headline-md font-bold text-on-surface">Dashboard Guru BK</h1>
      <p className="mt-2 text-body-md text-on-surface-variant">
        Dashboard guru BK akan dibangun di sub-project berikutnya.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Update `src/app/auth/callback/route.ts`**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Menangani penukaran (exchange) kode auth dari email confirmation
 * atau OAuth menjadi session Supabase, lalu arahkan ke area sesuai role.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      const next = profile?.role === "guru" ? "/guru" : "/kader";
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/kader/login?error=auth_callback_error`);
}
```

- [ ] **Step 7: Manually verify in the browser**

Run: `npm run dev`.
1. Logged out (clear cookies), visit `/kader` → redirected to `/kader/login`. Visit `/guru` → redirected to `/guru/login`.
2. Sign up a fresh kader at `/kader/login` → lands on `/kader` → see the "Menunggu verifikasi" holding view (since `is_verified` defaults to `false`).
3. In Supabase Dashboard → Table Editor → `profiles`, manually set that row's `is_verified` to `true`. Refresh `/kader` → now see the `KaderShell` with the "Beranda Kader" placeholder and working sidebar/bottom nav.
4. While still logged in as that kader, visit `/guru` → redirected to `/kader` (role mismatch).
5. Sign up a guru at `/guru/login` → lands on `/guru` directly (no verification gate) → see `GuruShell` with the "Dashboard Guru BK" placeholder.
6. Visit `/student` while logged out → loads normally (still public).

- [ ] **Step 8: Commit**

```bash
git add src/lib/supabase/proxy.ts src/app/kader/layout.tsx src/app/kader/page.tsx src/app/guru/layout.tsx src/app/guru/page.tsx src/app/auth/callback/route.ts
git commit -m "feat: gate /kader and /guru by role and verification, role-aware auth callback"
```

---

## Task 7: Root landing page and student route stub

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/student/page.tsx`

**Interfaces:**
- Consumes: `Button`, `Card` (Task 2).
- Produces: none consumed by later Foundation tasks — this is the last task. The Student portal plan replaces `src/app/student/page.tsx`'s content with the real welcome screen.

- [ ] **Step 1: Replace `src/app/page.tsx`**

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface p-sm">
      <div className="text-center">
        <h1 className="text-headline-lg font-bold text-on-surface">Ruang Cerita</h1>
        <p className="mt-2 text-body-lg text-on-surface-variant">
          Safe space untuk cerita, didengar, dan didampingi.
        </p>
      </div>

      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-3">
        <Card className="flex flex-col items-center gap-3 text-center">
          <p className="text-headline-md font-semibold text-on-surface">Siswa</p>
          <p className="text-body-md text-on-surface-variant">
            Cerita secara anonim, tanpa perlu akun.
          </p>
          <Link href="/student" className="w-full">
            <Button className="w-full">Mulai Cerita</Button>
          </Link>
        </Card>

        <Card className="flex flex-col items-center gap-3 text-center">
          <p className="text-headline-md font-semibold text-on-surface">Kader</p>
          <p className="text-body-md text-on-surface-variant">
            Masuk untuk mendampingi siswa.
          </p>
          <Link href="/kader/login" className="w-full">
            <Button variant="secondary" className="w-full">
              Masuk Kader
            </Button>
          </Link>
        </Card>

        <Card className="flex flex-col items-center gap-3 text-center">
          <p className="text-headline-md font-semibold text-on-surface">Guru BK</p>
          <p className="text-body-md text-on-surface-variant">
            Masuk untuk memantau dan mendampingi.
          </p>
          <Link href="/guru/login" className="w-full">
            <Button variant="secondary" className="w-full">
              Masuk Guru BK
            </Button>
          </Link>
        </Card>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Replace `src/app/student/page.tsx`**

The previous version inserted directly into `counseling_sessions`, which Task 1 dropped — replace the whole file with a placeholder (the real wizard is the next plan):

```tsx
export default function StudentLandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 p-sm text-center">
      <h1 className="text-headline-lg font-bold text-on-surface">Selamat Datang</h1>
      <p className="text-body-md text-on-surface-variant">
        Alur cerita siswa (pilih topik, pilih teman cerita, dan ruang chat)
        akan dibangun di sub-project berikutnya.
      </p>
    </main>
  );
}
```

- [ ] **Step 3: Manually verify in the browser**

Run: `npm run dev`, open `http://localhost:3000/`.
Expected: three cards (Siswa / Kader / Guru BK) render with working links to `/student`, `/kader/login`, `/guru/login` respectively. Visiting `/student` shows the placeholder with no console errors (confirming nothing still references the dropped `counseling_sessions` table).

- [ ] **Step 4: Run the full test suite one more time**

Run: `npm run test`
Expected: all tests from Tasks 1 and 3 still PASS (nothing in this task touched schema or chat logic, this is a final regression check).

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx src/app/student/page.tsx
git commit -m "feat: add 3-way landing page, stub out student route pending its own plan"
```
