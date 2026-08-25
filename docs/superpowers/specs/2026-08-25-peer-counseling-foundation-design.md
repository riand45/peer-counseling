# Peer Counseling — Foundation Design

Date: 2026-08-25
Status: Approved by user, ready for implementation plan

## 1. Context & scope

The app ("Ruang Cerita") has three sides, built from mockups in `design/student`,
`design/kader`, `design/guru`:

- **Student**: anonymous peer-counseling flow — welcome, pick topic, pick a kader
  ("teman cerita"), anonymous profile, my conversations ("Cerita Saya"), confirm
  before starting, report a session, live chat.
- **Kader** (trained peer counselor, logs in): dashboard, chat, escalate to guru,
  profile, transfer consultation to another kader.
- **Guru BK** (school counselor, logs in): dashboard, consultation list, stats,
  consultation detail (with monitor/takeover).

This is too large for one implementation plan, so it's decomposed into four
sub-projects, each with its own brainstorm → spec → plan cycle:

1. **Foundation** (this spec) — DB schema/RLS, student privacy mechanism,
   realtime chat transport, auth/routing skeleton for kader & guru, shared
   design system/components.
2. Student portal (built on Foundation).
3. Kader portal (built on Foundation + reuses chat transport from Student).
4. Guru portal (built on Foundation + reuses chat transport, read-mostly + takeover).

Only Foundation is specced in detail here. The other three will get their own
spec files when brainstormed.

### Key decisions from brainstorming

- Student identity stays **localStorage + no Supabase Auth** (user's explicit
  choice over Anonymous Auth), but privacy is enforced at the application layer
  instead of RLS (see §3) so this doesn't mean "anyone with the anon key can
  read anyone's chat."
- Kader and guru get **separate** login pages: `/kader/login`, `/guru/login`
  (not one shared `/login`).
- This is treated as a fresh dev database (only the initial scaffold commit
  exists) — `supabase/schema.sql` is rewritten wholesale rather than migrated
  column-by-column from the current minimal version.

## 2. Data model

New enums:

```sql
create type public.topic as enum (
  'pertemanan', 'bullying', 'keluarga', 'akademik',
  'perasaan', 'lingkungan_sekolah', 'lainnya'
);
create type public.kader_status as enum ('available', 'busy', 'offline');
create type public.session_status as enum ('waiting', 'active', 'escalated', 'ended');
create type public.sender_role as enum ('student', 'kader', 'guru', 'system');
create type public.escalation_status as enum ('pending', 'acknowledged', 'resolved');
create type public.report_reason as enum ('uncomfortable', 'unresponsive', 'need_teacher', 'other');
create type public.report_status as enum ('open', 'reviewed');
create type public.assignment_reason as enum ('assign', 'transfer', 'takeover');
```

`app_role` enum already exists (`kader`, `guru`) — unchanged.

Tables:

- **`profiles`** (existing, extended) — adds `bio text`, `topics public.topic[]`,
  `status public.kader_status not null default 'offline'`. These three columns
  are only meaningful for `role = 'kader'` rows; guru rows leave them at
  defaults/null. No new table for kader-specific data — avoids an extra join
  for the dashboard/profile screens.

- **`student_identities`** — `id uuid pk default gen_random_uuid()` (this *is*
  the `local_id` stored in the student's browser), `nickname text`,
  `avatar_seed text`, `created_at timestamptz default now()`. RLS enabled,
  **no policies** — only the service-role client (server-only) ever touches
  this table, so leaving it policy-less locks it to that.

- **`sessions`** — `id uuid pk`, `student_local_id uuid references
  student_identities`, `assigned_to uuid references profiles null`, `topic
  public.topic not null`, `status public.session_status not null default
  'waiting'`, `started_at timestamptz`, `ended_at timestamptz`,
  `last_message_at timestamptz`, `created_at timestamptz default now()`.
  `assigned_to` replaces the old `handled_by`/kader-only framing — it can hold
  a kader's or (after guru takeover) a guru's `profiles.id`, since both share
  the `profiles` table.

- **`messages`** — `id uuid pk`, `session_id uuid references sessions`,
  `sender_role public.sender_role not null`, `body text not null`,
  `created_at timestamptz default now()`, `read_at timestamptz`.

- **`session_assignments`** — audit trail for who a session was assigned/
  transferred/taken over by: `id uuid pk`, `session_id references sessions`,
  `from_id uuid references profiles null`, `to_id uuid references profiles
  not null`, `changed_by uuid references profiles not null`, `reason
  public.assignment_reason not null`, `created_at timestamptz default now()`.
  One table covers kader "alihkan" (`reason='transfer'`) and guru "ambil alih"
  (`reason='takeover'`) — no need for separate tables.

- **`escalations`** — `id uuid pk`, `session_id references sessions`,
  `kader_id uuid references profiles not null`, `reason text`, `status
  public.escalation_status not null default 'pending'`, `created_at
  timestamptz default now()`, `resolved_by uuid references profiles`,
  `resolved_at timestamptz`. Inserting a row also sets `sessions.status =
  'escalated'` (done in the same server action / a trigger — implementation
  detail for the plan).

- **`session_reports`** — `id uuid pk`, `session_id references sessions`,
  `reason public.report_reason not null`, `details text`, `status
  public.report_status not null default 'open'`, `created_at timestamptz
  default now()`. Guru-only visibility (not even the assigned kader can read
  reports about themselves — matches the sensitivity of the mockup's "Laporkan
  Sesi" flow).

`counseling_sessions` from the current `schema.sql` is dropped and replaced by
`sessions` + `messages` above.

## 3. Student privacy without Supabase Auth

Anon Postgres requests all share one static API key — there is no per-browser
identity Postgres RLS can check. Rather than grant the `anon` role any
`select`/`insert`/`update` on `sessions`, `messages`, `student_identities`, or
`session_reports` (which would let anyone holding the public anon key read or
enumerate every student's conversations), **all student-side reads and writes
go through Next.js Server Actions** using a server-only Supabase client
authenticated with the **service role key** (`SUPABASE_SERVICE_ROLE_KEY`, a new
server-only env var — never `NEXT_PUBLIC_*`, never imported into a client
component).

Each such action takes `{ sessionId, studentLocalId }` (or just `studentLocalId`
for identity/profile actions), loads the row, and checks
`session.student_local_id === studentLocalId` before doing anything — the
`studentLocalId` (a `crypto.randomUUID()` already generated client-side and
kept in `localStorage`, same as today) acts as an unguessable bearer capability
token. This is the same trust model as a "secret link" (e.g. a shared Google
Doc URL): whoever holds the token can act as that student, but the token
cannot be derived or enumerated.

Net effect: `anon` gets **zero grants** on the four tables above. Kader and
guru keep ordinary RLS (`assigned_to = auth.uid()` for kader,
`public.is_guru()` for guru) since they're real authenticated Supabase users —
unchanged in spirit from the existing `profiles` policies.

> **Correction found during implementation (binding for future plans).**
> Supabase provisions every project with `alter default privileges in schema
> public grant all on tables to anon, authenticated`, so *omitting* a grant
> statement does **not** by itself deny access — an unmatched RLS policy on a
> table with an inherited default grant returns an empty result (200, 0 rows),
> not a permission error. "Zero grants" above therefore has to be made true
> explicitly. The shipped schema closes this with an explicit
> `revoke all on <table> from anon, authenticated` before the intended
> re-grants, on every table, **plus** a schema-wide
> `alter default privileges in schema public revoke all on tables from anon,
> authenticated` so future tables don't silently reopen it. Any future
> migration adding a new table must include an explicit revoke for
> `anon`/`authenticated` unless that table is genuinely meant to be broadly
> readable — and note that the failure mode is a silent empty success, so a
> naive "does it error?" test will not catch a regression here.

A new `src/lib/supabase/service.ts` exports the service-role client, used only
inside `"use server"` files.

## 4. Realtime chat transport (shared by all three portals)

Because anon clients have no RLS-visible identity, a student's browser
subscribing to `postgres_changes` on `messages` would receive nothing even for
messages sent by their own kader (Realtime enforces the same RLS as
PostgREST). So instead of `postgres_changes`, chat delivery uses a **Supabase
Realtime Broadcast channel per session**, named `session:{sessionId}` — this
is plain pub/sub, not RLS-gated, and the channel name (a UUID) is only known
to participants.

Flow:

1. A `sendMessage({ sessionId, body, senderRole, studentLocalId? })` Server
   Action validates the sender (student → `studentLocalId` check against the
   session; kader → `auth.uid() === session.assigned_to`; guru →
   `is_guru()`), persists the row via the appropriate client (service role for
   student, the caller's authenticated client for kader/guru), then broadcasts
   the new message payload on `session:{sessionId}`.
2. All three chat screens (student, kader, guru) use one shared
   `useSessionChat(sessionId)` hook that subscribes to that channel for
   `new_message` events, plus an ephemeral (non-persisted) `typing` broadcast
   event for the typing indicators shown in the mockups.
3. Initial history load (on opening a session) also goes through a
   `getSessionMessages` Server Action rather than a direct client `select` —
   keeping the "anon gets zero direct grants" rule consistent for the student
   path, and giving kader/guru one uniform code path instead of two.

One hook, one send action, one history-load action — reused by Student, Kader,
and Guru sub-projects rather than three separate implementations.

## 5. Auth & routing

- **`/kader/login`** and **`/guru/login`** — new pages, restyled with the
  Ruang Cerita design tokens, each a fixed-role login+signup form. The
  existing `src/app/login/actions.ts` logic (login/signup/verifyKader/signout)
  is split/reused: signup on `/kader/login` always submits `role: 'kader'`,
  signup on `/guru/login` always submits `role: 'guru'` — no role `<select>`
  needed anymore. The current shared `/login` page and route are removed.
- **`proxy.ts`** public prefixes become `/`, `/student`, `/kader/login`,
  `/guru/login`, `/auth`. `/kader/**` (minus `/kader/login`) requires a
  logged-in user with `role = 'kader'`; `/guru/**` (minus `/guru/login`)
  requires `role = 'guru'`. Wrong role or logged-out → redirect to the
  correct login page. Per this repo's Next.js 16 docs, proxy is only the
  cheap optimistic redirect — role/ownership is re-checked in every Server
  Action and via RLS, not just here.
- An unverified kader (`profiles.is_verified = false`) can still reach
  `/kader`, but the page renders a "menunggu verifikasi guru BK" holding view
  instead of the dashboard — no proxy-level block, just a data check in the
  page.
- Root `/` becomes a simple 3-way landing (Saya siswa / Saya kader / Saya
  guru) replacing the current mixed kader+guru dashboard that lived at
  `src/app/page.tsx`.
- `src/app/auth/callback/route.ts` stays, but its post-exchange redirect
  target becomes role-aware (`/kader` or `/guru`) instead of always `/`.

## 6. Shared design system

One Tailwind theme extension matching the tokens in
`design/*/ruang_cerita_design_system/DESIGN.md`:

- Colors: `primary #005da7`, `background/surface #f8f9fa`,
  `surface-container-lowest #ffffff`, `on-surface #191c1d`, `error #ba1a1a`,
  plus the container/fixed variants documented there.
- Typography: Plus Jakarta Sans; scale `headline-lg` 32/40 (24/32 mobile),
  `headline-md` 20/28, `body-lg` 18/28, `body-md` 16/24, `label-md` 14/20,
  `label-sm` 12/16.
- Spacing: 4px base grid (`xs 8, sm 16, md 24, lg 40, xl 64`), gutter 20px,
  mobile margin 16px, desktop content max-width 1200px.
- Radius: 12px inputs/buttons, 16–24px cards/modals, full-round chips/avatars.

Shared components (used across Student/Kader/Guru sub-projects, built once
here): `Button` (primary/secondary/ghost), `Card`, `Chip`/`StatusBadge`,
`Modal` (escalation confirm + transfer confirm both reuse this), `ChatBubble`
(student vs counselor variant), and three layout shells — `StudentShell`,
`KaderShell`, `GuruShell` — implementing the sidebar (desktop) + top bar +
bottom nav (mobile) pattern from the mockups, each with its own nav item set.

## 7. Explicit scope cuts

- "Jurnal" / "Materi" nav items appear in the mockups' shared shell but aren't
  in the requested feature list — omitted from the nav rather than built as
  placeholder pages.
- No dedicated guru profile screen was requested — logout/account stays a
  sidebar action, no separate route.
- Kader "alihkan" and guru "ambil alih" reassign `sessions.assigned_to`
  immediately, no re-acceptance step by the new assignee — matches the
  mockups' instant success state.
- Guru "Hapus Log" performs a real delete of that session's messages (as the
  mockup literally offers), behind the confirm dialog already present in the
  design — not a soft-delete.
- No specialty/topic-based filtering of the kader waiting queue for MVP — any
  verified kader sees all sessions `assigned_to` them regardless of topic
  match to their `profiles.topics`.
- Kader/guru presence (`profiles.status`) is a plain persisted field, refetched
  on navigation — no dedicated realtime presence channel for status itself
  (only chat messages/typing use Realtime).

## 8. What's deferred to the next three specs

- **Student sub-project**: route tree under `src/app/student/**`, the
  topic→kader→confirm wizard's client-side state (a context provider in a
  shared layout, not query params), the "Cerita Saya" inbox query, and wiring
  the welcome/profile/report screens to the actions and hook described above.
- **Kader sub-project**: route tree under `src/app/kader/**`, dashboard
  queries (active/waiting lists), the escalate-modal and transfer-page actions
  against `escalations`/`session_assignments`, and the profile edit form.
- **Guru sub-project**: route tree under `src/app/guru/**`, the
  list/filter/pagination query, the stats aggregation (computed from
  `sessions`/`messages` directly for MVP — no materialized views), and the
  detail screen's take-over/escalate-to-professional/mark-complete/delete-log
  actions against `session_assignments`/`sessions`/`messages`.

Each will get its own brainstorm session, spec file, and implementation plan
before code is written for that portal.
