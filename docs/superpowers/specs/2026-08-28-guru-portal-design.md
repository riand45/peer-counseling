# Guru Portal — Design

Date: 2026-08-28
Status: Approved by user, ready for implementation plan

## 1. Context & scope

The Guru (BK) portal is still a stub: `src/app/guru/(protected)/page.tsx` just renders
"Dashboard guru BK akan dibangun di sub-project berikutnya", and the layout's nav has
only Beranda. Foundation already built everything a guru-side UI needs underneath this:
`is_guru()` grants a verified guru read access to *all* `profiles`/`sessions`/`messages`,
read+update on `escalations` and `session_reports`, and `session_assignments` supports
`assign`/`transfer`/`takeover` reasons. The shared chat transport
(`src/lib/chat/*`, `useSessionChat`) already resolves a `guru` actor via
`resolveStaffActor()`, and neither `sendMessageCore` nor `getSessionMessagesCore`
restrict a guru actor at all (guru RLS allows reading/writing regardless of
`assigned_to`) — so monitoring and messaging need **no chat-layer changes**.

This spec covers building the real thing against 3 of the 4 mockups in `design/guru/`:
dashboard (`dashboard_guru_bk_updated`), consultation list
(`daftar_konsultasi_guru_bk`), and consultation detail (`detail_konsultasi_guru_bk`).
The 4th mockup, `statistik_pendampingan` (charts/analytics), is explicitly **out of
scope** — it needs its own data-aggregation design and a charting approach (no chart
library is installed in this project today) and will get its own spec later.

Like the kader portal, **no schema change is needed** — every table, column, and RLS
policy this flow touches already exists.

### Mockup nav inconsistency (resolved)

The 4 mockup files disagree on the sidebar: `dashboard_guru_bk_updated` (the one
marked "_updated") shows **Beranda / Daftar Konsultasi / Laporan / Statistik /
Profil**, fitting a guru/BK's actual job. The other 3 mockups show **Beranda / Ruang
Chat / Jurnal / Materi / Profil** plus a "Buka Sesi Chat" button — this is stale
copy-paste from the student-portal template (Jurnal/Materi are student self-help
features; a guru monitoring sessions doesn't open their own chat session) and is not
followed. The dashboard mockup's nav is treated as canonical.

Of that canonical 5-item nav, this phase ships only **Beranda / Daftar Konsultasi /
Profil**. Laporan has no mockup or spec anywhere in this project and Statistik is
explicitly deferred (see above) — both are omitted from the nav entirely rather than
shipped as dead links, the same "omit rather than add a dead link" call the kader spec
made for its missing "Ruang Chat" nav destination. Add Statistik's nav item back when
its own spec/build ships; revisit Laporan only if it's ever scoped.

### Delivery phasing

- **Phase 1** (this implementation plan): Beranda (stat cards, "Butuh Perhatian",
  "Aktivitas Terbaru"), Daftar Konsultasi (search, status filter, pagination), Detail
  Konsultasi (info card, live transcript, Ambil Alih Percakapan, Tandai Selesai), and
  a minimal Profil. "Alihkan ke Profesional" and "Hapus Log" are present in the
  Detail Konsultasi action panel but disabled — the same deferred-but-visible pattern
  the kader chat header used for its Alihkan/Hubungi Guru-BK buttons in Phase 1.
- **Phase 2+** (separate spec, not designed here): Statistik & Analitik; whatever
  "Laporan" turns out to mean if it's ever scoped; "Alihkan ke Profesional" once
  there's an actual external-referral concept to build against; log deletion, if ever
  justified, would need its own audit-preserving design (a hard delete conflicts with
  this app's audit-trail intent and is not something to bolt on later without
  thought).

## 2. Routes

- **`/guru`** (rewritten) — Beranda. Greeting, 4 stat cards (Total Konsultasi, Sedang
  Berlangsung, Menunggu, Selesai — counts of `sessions` grouped by `status`, guru
  reads all via RLS), a "Butuh Perhatian" panel, and an "Aktivitas Terbaru" table
  linking into `/guru/konsultasi/[sessionId]`.
- **`/guru/konsultasi`** — Daftar Konsultasi. Search input (matches session id or
  resolved student display name) + status filter tabs (Semua/Menunggu/
  Berlangsung/Selesai) + paginated table (student display name, topic, assigned
  kader's name, status, date), each row's action button linking to
  `/guru/konsultasi/[sessionId]`.
- **`/guru/konsultasi/[sessionId]`** — Detail Konsultasi. Stays inside the normal
  `GuruShell` chrome (unlike the kader/student chat screens, the mockup keeps the
  sidebar visible here — this is a monitoring view, not a dedicated chat surface).
  Left column: session info card (student display name, assigned kader, topic,
  status) + action panel. Right column: live transcript via `useSessionChat`
  (read-only bubbles until Ambil Alih is used, then a message input appears, reusing
  the same hook to send as the `guru` actor).
- **`/guru/profil`** — no mockup exists for this; ships as a minimal identity page
  (initials avatar, name, "Guru BK" badge), mirroring the kader portal's Phase-1
  Profil (identity only, no editable fields).

## 3. Student & kader display

Guru never see a student's real identity, same as kader. Reuses the existing
`getStudentDisplayName`/`AVATAR_SEED_LABELS` from `@/lib/student/types` — no new
pseudonym subsystem, consistent with how the kader portal resolved the same mockup
inconsistency (whimsical names like "SobatPanda"/"LangitBiru" don't map to any real
field; they're derived the same way kader session cards already are).

The assigned kader's name is just `profiles.full_name`, readable by a guru for any
row via the "profiles: guru baca semua" policy — no lookup indirection needed there.

## 4. New Server Actions

All in `src/lib/guru/actions.ts`, `"use server"`, mirroring the kader portal's split:
a `..Core(supabase, ...)` function in `src/lib/guru/core.ts` (explicit
`SupabaseClient`, no `"use server"`, unit-testable) plus a same-named wrapper in
`actions.ts` that resolves `createClient()` and delegates. All use the
**authenticated** client — RLS's `is_guru()` already gates every read/write this
plan needs, so no manual authorization checks are written in `core.ts` beyond what
RLS itself enforces. `student_identities` lookups still go through
`createServiceClient()` afterward (that table has no `authenticated` grant at all,
same constraint the kader portal worked around) — safe here because the id list
comes from a query RLS already scoped to `is_guru()`, not from client input.

- **`getGuruDashboard()`** → own `profiles.full_name` + counts of `sessions` grouped
  by `status`; a "Butuh Perhatian" list merging `escalations` where
  `status = 'pending'` and `session_reports` where `status = 'open'` (sorted by
  `created_at desc`), each resolved to its session's topic + student display name;
  an "Aktivitas Terbaru" list of the most recent N sessions (any status) with
  student display name, topic, assigned kader's `full_name`, status, and
  `last_message_at`.
- **`listConsultations({ status?, search?, page })`** → paginated `sessions` (all
  of them — guru RLS has no `assigned_to` restriction), each row resolved to student
  display name, topic, assigned kader name, status, `created_at`. `search` matches
  against session id or the resolved display name.
- **`getConsultationDetail({ sessionId })`** → topics, status, timestamps, student
  display name, and assigned kader's name for one session; throws "Sesi tidak
  ditemukan" if the row doesn't exist (RLS means a non-guru caller never reaches this
  function at all — the layout's role gate already redirects non-guru users before
  any guru-only page renders).
- **`endConsultationAsGuru({ sessionId })`** → `update sessions set status = 'ended',
  ended_at = now() where id = sessionId`, via the "sessions: guru update semua"
  policy. Revalidates `/guru` and `/guru/konsultasi`.
- **`takeOverConsultation({ sessionId })`** → inserts one `session_assignments` row
  (`from_id` = the session's current `assigned_to`, `to_id` = the guru,
  `changed_by` = the guru, `reason = 'takeover'`) and updates
  `sessions.assigned_to` to the guru's id. This is bookkeeping + reassignment, not a
  permission unlock: RLS already lets any verified guru insert a `message` with
  `sender_role = 'guru'` into any session regardless of `assigned_to` — the button's
  job is the audit trail and flipping the session away from the original kader
  (who would otherwise still see it as their own active session), plus flipping the
  Detail Konsultasi UI from read-only to an input box. Revalidates
  `/guru/konsultasi/[sessionId]`.

Chat itself needs no new actions — `sendMessage`, `getSessionMessages`, and
`useSessionChat` already work unmodified for a guru actor (verified by reading
`resolveStaffActor()` and `assertActorCanAccessSession()`: the `guru` actor kind has
no restriction branch in either, matching guru RLS having no `assigned_to` check).

## 5. Components

- `src/components/guru/StatCard.tsx` — one Beranda stat tile (icon, label, value).
- `src/components/guru/AttentionPanel.tsx` — "Butuh Perhatian" card (escalation /
  laporan user items, each linking into its session's Detail Konsultasi).
- `src/components/guru/ActivityTable.tsx` — "Aktivitas Terbaru" table (Beranda).
- `src/components/guru/DashboardScreen.tsx` — wires `getGuruDashboard()` into the
  greeting, 4 `StatCard`s, `AttentionPanel`, `ActivityTable`.
- `src/components/guru/ConsultationTable.tsx` — the Daftar Konsultasi table
  (search box, status tabs, pagination, per-row action button).
- `src/components/guru/ConsultationListScreen.tsx` — wires `listConsultations()`
  into `ConsultationTable`, owns search/filter/page state.
- `src/components/guru/ConsultationDetailScreen.tsx` — session info card + live
  transcript (reuses `useSessionChat` and the existing `ChatBubble`) + action panel.
  "Ambil Alih Percakapan" opens the existing `Modal` to confirm before calling
  `takeOverConsultation`; once taken over, the read-only transcript is replaced by a
  message input using the same `useSessionChat().send`. "Tandai Selesai" calls
  `endConsultationAsGuru` directly, no confirm modal (matching the kader chat
  screen's unconfirmed "Selesaikan Sesi"). "Alihkan ke Profesional" and "Hapus Log"
  render `disabled`.
- Reused as-is: `Button`, `Card`, `Chip`, `ChatBubble`, `Modal`, `GuruShell`/`AppShell`.

## 6. Known Phase 1 gaps (accepted, not blocking)

- **"Menunggu" status is currently unreachable.** `startSession` (student flow)
  always creates a session with `status: "active"` directly — `'waiting'` is never
  produced by any code path today (same "parked for a possible future queue" state
  the kader spec called out). The Menunggu stat/tab/filter still works correctly
  against the schema, it's just expected to always read 0 until a queue-based
  assignment flow is ever built.
- **No typing-indicator UI** ("Siswa sedang mengetik..." from the mockup) — no
  presence/typing infra exists for the guru side to hook into beyond the existing
  `notifyTyping`/`typingFrom` broadcast in `useSessionChat`, which is currently wired
  for kader/student chat only. Omitted rather than half-built; revisit if the guru
  monitoring view specifically needs it.
- Beranda's stat cards and lists are fetched on load/navigation only, no realtime
  subscription — consistent with the kader dashboard's same call (Foundation §7's
  "no live presence subscription" scope).
- `/guru/profil` in Phase 1 shows identity only — no bio/settings, since guru has no
  editable profile fields analogous to kader's bio/topics in the first place.
