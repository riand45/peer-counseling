# Guru Portal — Phase 2 Design

Date: 2026-08-28
Status: Approved by user, ready for implementation plan

## 1. Context & scope

The Guru Portal Phase 1 spec (`2026-08-28-guru-portal-design.md`) shipped Beranda,
Daftar Konsultasi, Detail Konsultasi, and a minimal Profil, and explicitly deferred
four things to "Phase 2+" without designing any of them: Statistik & Analitik,
"Laporan", "Alihkan ke Profesional", and an audit-preserving "Hapus Log".

Of those four, this spec covers three:

- **Statistik & Analitik** (`/guru/statistik`) — the 4th mockup,
  `design/guru/statistik_pendampingan`, which Phase 1 explicitly put out of scope
  pending "its own data-aggregation design and a charting approach".
- **"Alihkan ke Profesional"** — wiring up the button Phase 1 already rendered
  `disabled` in the Detail Konsultasi action panel.
- **"Hapus Log"** — wiring up the other button Phase 1 rendered `disabled` in the
  same panel, with the audit-preserving design Phase 1 said it would need.

**"Laporan" is out of scope for this phase** and remains deferred. Unlike the other
three, it has no mockup, no prior spec language describing what it contains, and no
existing UI (not even a disabled button) pointing at it anywhere in the codebase —
there's nothing to design against yet. It stays out of the canonical nav until it
gets its own spec.

Like Phase 1, no schema change is *required* by RLS or auth — but this phase does
add two small, additive pieces of schema (§2) to support archiving and referral
records, since neither concept existed before.

## 2. Data model changes

Both additions are additive only — no existing table, column, or RLS policy from
Foundation or Phase 1 changes meaning.

- **`sessions.archived_at timestamptz null`** (new column, default `null`). Set once,
  by `archiveSessionCore`, when a guru uses "Hapus Log". `NULL` (the default and the
  state of every existing row) means the session behaves exactly as it does today —
  visible everywhere, unarchived. Nothing else about the row changes: this is a
  visibility flag, not a deletion. Chosen over a hard delete because a hard delete
  would destroy the audit trail (`session_assignments`, `escalations`,
  `session_reports`, `messages` rows referencing this session) that the rest of the
  app depends on and that Phase 1 explicitly flagged as a reason not to bolt on a
  real delete without a dedicated design.
- **New table `professional_referrals`**: `id uuid primary key default
  gen_random_uuid()`, `session_id uuid not null references sessions(id) on delete
  cascade`, `referred_by uuid not null references profiles(id) on delete cascade`,
  `note text`, `created_at timestamptz not null default now()`. One row per
  "Alihkan ke Profesional" click — append-only, mirroring the existing
  `session_assignments` audit-log shape (insert-only, no update/delete policy).
  RLS: guru can `insert` and `select` (gated by `is_guru()`, same predicate as the
  rest of the guru read/write policies); no `update` or `delete` policy exists, so
  referral records are permanent once created, same as `session_assignments` rows.

Both additions ship as one new idempotent block appended to `supabase/schema.sql`,
consistent with how Foundation and Phase 1 evolved the same file.

## 3. Default-query changes (archiving takes effect everywhere)

Rather than teaching every consumer about `archived_at`, the two existing guru
read paths that list or count sessions get one added filter each, so archived
sessions disappear from the whole app by default with no other code touched:

- `getGuruDashboardCore` (Beranda counts, "Aktivitas Terbaru") — adds
  `.is("archived_at", null)` to its `sessions` queries.
- `listConsultationsCore` (Daftar Konsultasi) — adds `.is("archived_at", null)`
  **unless** the new `includeArchived` param (§4) is `true`.

`getConsultationDetail` (Detail Konsultasi) is intentionally **not** filtered — a
guru who already has the link to an archived session's detail page (e.g. they just
archived it, or navigated to it from browser history) can still open it; archiving
hides sessions from *listings*, it doesn't 404 the page. The detail screen shows a
"Diarsipkan" state (§6) when `archived_at` is set.

## 4. New/changed server actions

All in `src/lib/guru/core.ts` + `src/lib/guru/actions.ts`, same `..Core(supabase,
...)` / `"use server"`-wrapper split as Phase 1, same reliance on RLS for
authorization (no manual role checks beyond what `is_guru()` already enforces).

- **`getGuruStatisticsCore(supabase, { rangeDays })`** → `rangeDays` is `7 | 30 |
  90`. Fetches `sessions` (`id, topics, status, student_local_id, started_at,
  ended_at, created_at`) where `created_at >= now() - rangeDays` and
  `archived_at is null`, plus `escalations` (`created_at, status`) over the same
  window, then aggregates in JS (matching `getGuruDashboardCore`'s existing
  fetch-then-aggregate style rather than hand-writing SQL aggregates). Returns:
  - `totalSessions` — row count.
  - `activeStudents` — distinct `student_local_id` count.
  - `avgDurationMinutes` — mean of `(ended_at - started_at)` in minutes, over rows
    where both are non-null; `null` if no ended session exists in range.
  - `escalationCount` — count of `escalations` rows with `status = 'pending'` and
    `created_at` in range (same "pending" filter the Beranda "Butuh Perhatian"
    panel already uses, for consistent semantics).
  - `trend: { date: string; count: number }[]` — one entry per calendar day in the
    range (including zero-count days), sessions bucketed by `created_at`'s date.
  - `statusDistribution: { status: SessionStatus; count: number }[]` — a
    straight group-by over the fetched sessions' `status` column (all 4
    `SessionStatus` values, `waiting`/`active`/`escalated`/`ended`; zero-count
    statuses still get an entry). No derivation needed: unlike `'waiting'`
    (Phase 1's documented "parked, no code path produces it" gap),
    `'escalated'` is genuinely reachable — `supabase/schema.sql`'s
    `on_escalation_created` trigger sets `sessions.status = 'escalated'` on
    every `escalations` insert, and nothing ever reverts it (there is no
    "resolve" action anywhere in the codebase that sets it back to `active`;
    only Phase 1's "Tandai Selesai" moves it again, straight to `ended`).
  - `topicDistribution: { topic: Topic; count: number }[]` — one entry per
    `Topic` enum value (all 7, `TOPICS` order), counting sessions whose `topics`
    array contains that value (a session with multiple topics counts once per
    topic it has — this is a "how many sessions touched this topic" count, not a
    partition, matching what the mockup's bar chart visually implies).
- **`archiveSessionCore(supabase, { sessionId })`** → `update sessions set
  archived_at = now() where id = sessionId`, via the existing "sessions: guru
  update semua" policy (same policy `endConsultationAsGuru` already uses).
  Revalidates `/guru`, `/guru/konsultasi`, `/guru/konsultasi/[sessionId]`.
- **`referToProfessionalCore(supabase, { sessionId, note })`** → `note` is
  optional, trimmed, stored as `null` if empty. Inserts one
  `professional_referrals` row with `referred_by` set to the calling guru's
  `auth.uid()`. Revalidates `/guru/konsultasi/[sessionId]`.
- **`listConsultationsCore`** gains one new optional input, `includeArchived?:
  boolean` (default `false`), threaded into the `.is("archived_at", null)` filter
  described in §3. Existing callers (Phase 1's `ConsultationListScreen` state,
  before this phase's UI change) are unaffected since the param is optional.
- **`getConsultationDetailCore`** additionally selects `archived_at` and the most
  recent `professional_referrals` row for the session (if any), returning
  `archivedAt: string | null` and `latestReferral: { note: string | null;
  createdAt: string } | null` on `ConsultationDetail`.

Chat itself is unaffected — same as Phase 1, no changes to `src/lib/chat/*` or
`useSessionChat` are needed for any of this phase's features.

## 5. Statistik & Analitik (`/guru/statistik`)

New nav item, canonical position per Phase 1 §"Mockup nav inconsistency (resolved)"
(Beranda / Daftar Konsultasi / Statistik / Profil — "Laporan" stays omitted, §1).

**Layout**, top to bottom:

1. Header: "Statistik & Analitik" + a date-range `<select>` (7 / 30 / 90 Hari
   Terakhir, default 30) driving every number and chart below it, plus an Export
   button (§5.4).
2. 4 stat cards, reusing `StatCard` (§7 gives it one new optional prop): Total
   Sesi Chat, Siswa Aktif, Rata-rata Durasi, Kasus Eskalasi (caption "Butuh
   perhatian"). The mockup's "↗12%" trend arrows are **dropped** — they'd need a
   second query against the prior period for a comparison number nobody asked
   for; plain value + caption only.
3. `TrendChart` — area/line chart, one point per day in `trend`. X-axis renders
   real dates (e.g. "12 Agu"), not the mockup's bare `1..30` day-index, since a
   day index is meaningless once the range isn't exactly a calendar month.
4. `StatusDonutChart` — donut over `statusDistribution`'s 4 buckets, labeled
   and colored via the existing `SESSION_STATUS_LABELS`/`SESSION_STATUS_TONES`
   maps from `@/lib/guru/types` (already covers all 4 `SessionStatus` values,
   `'escalated'` included — no new label map needed).
5. `TopicBarChart` — bar chart over `topicDistribution`, one bar per the app's
   real 7 `Topic` values via `TOPIC_LABELS`. This **replaces** the mockup's 6
   invented categories ("Kecemasan", "Karir/Masa Depan") that don't correspond to
   any `Topic` enum value — same "canonical over stale mockup" resolution Phase 1
   applied to the nav.

### 5.1 Empty/zero states

A guru with no sessions in the selected range sees stat cards reading 0 and
charts rendering their empty form (flat trend line at 0, empty-state donut/bar —
whatever Recharts renders for an all-zero dataset; no bespoke empty-state
component, this isn't expected to be the common case for a real school).

### 5.2 Loading

Same pattern as `DashboardScreen`/`ConsultationListScreen`: fetch on mount and on
date-range change, a simple loading state while in flight, no skeleton screens
(none exist anywhere else in this app either).

### 5.3 Charting library

**Recharts** — new dependency (`recharts`), added to `package.json`. Chosen for
being the standard React charting library with composable components
(`AreaChart`/`PieChart`/`BarChart`) that map directly onto this page's 3 chart
types, over hand-rolling SVG (more code, more maintenance, no benefit here since
future chart needs — e.g. whatever Laporan turns out to need — will likely want
charts too).

### 5.4 Export

Client-side only, no new server action. The Export button serializes the
already-fetched `getGuruStatistics` response (stat totals + `trend` +
`statusDistribution` + `topicDistribution`, each as its own CSV section) into a
CSV string, wraps it in a `Blob`, and triggers a download via a temporary
`<a>`/`URL.createObjectURL` — the same client-only download mechanism, no server
round-trip, no new library.

## 6. Alihkan ke Profesional & Hapus Log (Detail Konsultasi)

Both buttons currently render `disabled` in `ConsultationDetailScreen`'s action
panel (Phase 1 §5). This phase wires them up, each behind the existing `Modal`:

- **"Alihkan ke Profesional"** — opens `Modal` with an optional note `<textarea>`
  ("Catatan (opsional)") and a confirm button → `referToProfessionalCore`. On
  success: the button becomes `disabled` and a `Chip` appears beneath it reading
  "Dirujuk ke Profesional · <relative time>" (sourced from
  `latestReferral.createdAt`, §4). This is a **record for the guru's own
  case-management judgment** — there is no professional role/account in this
  schema to hand the session to, no notification fires, and chat access is
  unaffected. Re-referring isn't blocked at the data layer (the table just gets
  another row) but the UI only exposes one click per page load, keeping the
  common case simple.
- **"Hapus Log"** — opens `Modal` with confirmation copy ("Sesi ini akan
  disembunyikan dari daftar aktif. Semua data (pesan, riwayat) tetap tersimpan
  dan tidak dihapus.") and a confirm button → `archiveSessionCore`, then routes
  back to `/guru/konsultasi` on success (an archived session is no longer
  actionable from its own detail page in this phase — see §3 on why the page
  itself still loads if reached directly).
- If a guru reaches an already-archived session's detail page directly (§3), the
  screen shows a neutral "Diarsipkan" `Chip` next to the status chip and both
  action buttons render `disabled` (nothing left to do to an archived session
  from this phase's UI) — read-only transcript stays visible.

Daftar Konsultasi gets one new control: a "Tampilkan yang diarsipkan" checkbox
next to the existing search/status-filter row (default unchecked → today's
behavior, `includeArchived: false`). Checked, archived rows appear in the table
with the same "Diarsipkan" `Chip`. **No un-archive action ships in this phase** —
nothing is destroyed (§2), so this is a pure UI gap, not a data-loss risk; easy
to add a button later without any migration.

## 7. Components

- `src/components/guru/StatCard.tsx` — **modified**, gains one optional
  `caption?: ReactNode` prop rendered under the value (used for "Butuh
  perhatian" on Kasus Eskalasi and "/ sesi" on Rata-rata Durasi; omitted on
  Beranda's 4 cards, unaffected).
- `src/components/guru/TrendChart.tsx` — new, wraps Recharts `AreaChart`.
- `src/components/guru/StatusDonutChart.tsx` — new, wraps Recharts `PieChart`
  with `innerRadius` for the donut look, plus a legend matching the mockup's
  4-color key.
- `src/components/guru/TopicBarChart.tsx` — new, wraps Recharts `BarChart`.
- `src/components/guru/StatisticsScreen.tsx` — new, owns the date-range state,
  wires `getGuruStatistics()` into the 4 `StatCard`s + 3 charts + Export
  handler.
- `src/components/guru/ConsultationDetailScreen.tsx` — **modified**: both action
  buttons wired to their respective `Modal` flows (§6), archived-state rendering.
- `src/components/guru/ConsultationTable.tsx` /
  `src/components/guru/ConsultationListScreen.tsx` — **modified**: "Diarsipkan"
  `Chip` rendering + the new checkbox and its state.
- Reused as-is: `Button`, `Card`, `Chip`, `Modal`, `GuruShell`/`AppShell`.

## 8. Known Phase 2 gaps (accepted, not blocking)

- **No un-archive UI** (§6) — data is fully intact and queryable at the DB level;
  this is a UI omission, not a data-loss risk.
- **No trend-percentage comparison** on any stat card (§5, point 2) — would
  require a second query against the prior equal-length period; nothing in the
  spec currently needs that number beyond matching the mockup's decoration.
- **A session stuck in `'escalated'` status has no "resolve" path anywhere in
  the app** (§4) — once `on_escalation_created` flips a session to
  `'escalated'`, nothing (this phase included) reverts it to `'active'`; the
  only way its status changes again is a guru ending it via "Tandai Selesai".
  So `statusDistribution`'s `escalated` bucket only shrinks for a given
  session by that session moving to `ended`, never by an escalation being
  independently acknowledged/resolved — matching the fact that no
  acknowledge/resolve action exists in the codebase today (pre-dates this
  phase, not something introduced or fixed here).
- **CSV export has no localization/formatting options** — one fixed format
  (comma-separated, ISO dates), no configurability.
- **"Laporan" remains fully out of scope** (§1) — still just a name with nothing
  designed against it anywhere in the codebase.
