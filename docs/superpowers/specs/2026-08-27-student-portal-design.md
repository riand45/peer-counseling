# Student Portal — Design

Date: 2026-08-27
Status: Approved by user, ready for implementation plan

## 1. Context & scope

The Foundation sub-project (`docs/superpowers/specs/2026-08-25-peer-counseling-foundation-design.md`)
built the schema, the student privacy model, the shared realtime chat transport,
and the shared design system/components, and explicitly deferred the Student
portal itself: `src/app/student/page.tsx` is still just a "Selamat Datang"
stub with no flow. This spec covers building the real thing against the 8
mockups in `design/student/`: welcome, pick topic, pick kader ("teman
cerita"), confirm, live chat, session history ("Cerita Saya"), anonymous
profile, and report a session.

Almost all of the hard infrastructure decisions were already made in
Foundation and are treated as fixed here: no Supabase Auth for students
(`localStorage`-held `studentLocalId` as an unguessable bearer token), all
student reads/writes through Server Actions using the service-role client,
chat over a Realtime Broadcast channel per session via the existing
`useSessionChat` hook. This spec only decides what Foundation left open:
routes, wizard state shape, the new student-specific Server Actions, and a
couple of small implementation calls.

### Delivery phasing

- **Phase 1** (this implementation plan): Welcome → Pilih Topik → Pilih Kader
  → Konfirmasi → Ruang Chat. A student can generate an identity, pick a topic
  and a kader, start a session, and hold a live conversation end-to-end.
- **Phase 2** (separate implementation plan, same spec): Cerita Saya, Profil
  Anonim, Laporkan Sesi.

## 2. Schema change

`sessions.topic public.topic not null` (singular) doesn't match the "Pilih
Topik" mockup, which is explicitly multi-select. Since `schema.sql` is still
treated as a rewritable dev schema (Foundation §1), this becomes:

```sql
alter table public.sessions
  drop column topic,
  add column topics public.topic[] not null default '{}';
```

No other schema changes. `sessions.status` keeps its `'waiting'` enum value
for a possible future queue-based flow, but this flow never produces a
`'waiting'` session — a session isn't created until a specific, available
kader has been chosen, so it's created directly as `'active'` with
`started_at = now()`.

## 3. Routes

No route uses `StudentShell` in Phase 1 — the wizard and chat are focused,
single-purpose screens per the mockups (no persistent nav chrome). Phase 2's
`cerita-saya` and `profil` are the first screens to use it.

- **`/student`** (rewritten) — if a `studentLocalId` already exists in
  `localStorage`, redirect immediately to `/student/cerita-saya` (Phase 1:
  until that route exists, redirect to `/student/topik` instead — see §8).
  Otherwise render the welcome card: safety/monitoring notice, optional
  nickname input, "Mulai Secara Anonim" → generates a `crypto.randomUUID()`
  client-side, calls `createStudentIdentity`, stores the id in `localStorage`,
  routes to `/student/topik`.
- **`/student/topik`** — Step 1/3. Multi-select topic chip-grid (7 topics from
  the `topic` enum, matches mockup exactly). "Lanjut" stores the selection in
  wizard context and routes to `/student/kader`.
- **`/student/kader`** — Step 2/3. Fetches all verified kader once via
  `listAvailableKader`; topic filter chips ("Semua" + one per topic present in
  the fetched list) filter **client-side** over that single fetch — no
  per-click round trip. Card CTA "Pilih Kak {name}" stores the kader id in
  wizard context and routes to `/student/konfirmasi`. An offline/busy kader's
  card shows a non-actionable "Tersedia Nanti" state instead of a CTA.
- **`/student/konfirmasi`** — Step 3/3. Reads topic(s) + kader from wizard
  context; if either is missing (e.g. hard refresh — wizard state is
  in-memory only, not persisted, per Foundation §8's explicit choice of
  context over query params), redirect back to `/student/topik`. "Mulai Chat
  Sekarang" calls `startSession`, which re-checks that the chosen kader's
  current `status` is still `'available'` and rejects with an error (surfaced
  as a message, sent back to `/student/kader`) if it isn't — then routes to
  `/student/chat/[sessionId]`. "Kembali & Ubah Pilihan" routes back to
  `/student/kader`.
- **`/student/chat/[sessionId]`** — Live chat via `useSessionChat(sessionId,
  studentLocalId)`. Header shows the kader's name + a status dot (snapshot
  fetched once on load, no live presence subscription, per Foundation §7).
  "Mode Pantau" notice banner. "Selesaikan Sesi" calls `endSession`, then
  routes to `/student/cerita-saya` (Phase 1: to `/student/topik`, see §8). The
  flag/report icon is wired to open the `Modal`-based report flow starting in
  Phase 2 — present but disabled/hidden in Phase 1.

Phase 2 additions:

- **`/student/cerita-saya`** — `StudentShell`. List via `getStudentSessions`
  (session + assigned kader's name + last message preview + status), search
  filters client-side over the already-fetched list. Empty state matches the
  mockup. "Mulai Cerita Baru" → `/student/topik`.
- **`/student/profil`** — `StudentShell`. Nickname (inline edit) + avatar
  (cycle through the preset set) via `getStudentProfile`/`updateStudentProfile`.
  "Hapus Akun Anonim" → `deleteStudentIdentity`, clears `localStorage`, routes
  to `/`.
- Report ("Laporkan Sesi") is a `Modal` opened from the chat screen's flag
  icon, not a separate route — submits via `submitSessionReport`.

## 4. Wizard state

A `(wizard)` route group under `src/app/student/(wizard)/` wraps `topik`,
`kader`, and `konfirmasi` in a layout that provides `StoryWizardProvider`: a
React context holding `{ topics: Topic[]; kaderId: string | null }` plus
setters, in-memory only. The same layout owns the shared step header
(back/wordmark/close + progress bar) so it isn't duplicated three times.

## 5. Identity

`src/lib/student/identity.ts` (client-side): `getStudentLocalId()` reads from
`localStorage` (`ruang-cerita:student-id` key) and returns `string | null`;
`setStudentLocalId(id)` writes it. The id itself is generated with
`crypto.randomUUID()` at the point of calling `createStudentIdentity` on the
welcome screen, then persisted — matching Foundation §3's "already generated
client-side" bearer-token model.

## 6. New Server Actions

All in `src/lib/student/actions.ts`, `"use server"`, all via
`createServiceClient()`, all taking `studentLocalId` and checking it against
the row's `student_local_id` before acting (per Foundation §3):

**Phase 1:**

- `createStudentIdentity({ localId, nickname? })` → inserts `student_identities`
  (nickname optional, `avatar_seed` set to a randomly chosen preset key even
  though it's not surfaced in UI until Phase 2's profile screen). Returns
  `{ id }`.
- `listAvailableKader()` → `select id, full_name, bio, topics, status from
  profiles where role = 'kader' and is_verified = true`.
- `startSession({ studentLocalId, topics, kaderId })` → re-checks that the
  kader's `status` is still `'available'`, inserts `sessions` (`topics`,
  `assigned_to = kaderId`, `status = 'active'`, `started_at = now()`). No
  `session_assignments` row — that table's `changed_by` is `not null
  references profiles(id)`, and a student has no `profiles` row; it's
  reserved for staff-initiated transfer/takeover in the later Kader/Guru
  sub-projects. Returns `{ sessionId }`.
- `endSession({ sessionId, studentLocalId })` → validates ownership, sets
  `status = 'ended'`, `ended_at = now()`.

**Phase 2:**

- `getStudentSessions({ studentLocalId })`, `getStudentProfile({
  studentLocalId })`, `updateStudentProfile({ studentLocalId, nickname?,
  avatarSeed? })`, `deleteStudentIdentity({ studentLocalId })`,
  `submitSessionReport({ sessionId, studentLocalId, reason, details? })`.

## 7. Components

- `TopicCard`, `KaderCard`, `StepHeader` — new, local to their pages/layout
  (single call site each, no shared-abstraction value yet).
- `ChatBubble` — extended with two new optional props: `avatarNode?: ReactNode`
  (rendered beside non-own bubbles) and `readReceipt?: "sent"` (own bubbles
  only). Real read-tracking (`messages.read_at`) is **not** wired up — the
  mockup's double-tick "read" state is out of scope since it would mean
  extending the shared `src/lib/chat/*` used by the not-yet-built Kader/Guru
  portals too; Phase 1 shows a single "sent" tick only.
- Preset avatars: `src/lib/student/avatars.ts` — 6–8 bundled inline-SVG
  "friendly animal" icons keyed by short seed strings. Chosen over an
  external avatar-generation service (e.g. DiceBear) so no student data
  (seed, IP) ever leaves the app to render an avatar — bundled/self-contained
  matters for a privacy-sensitive teen counseling app. First actually
  surfaced in Phase 2's profile screen.
- `Modal.tsx` gets the same `max-w-sm` → `max-w-[24rem]` fix already applied
  to the login pages (both hit the same `--spacing-sm`/`max-w-sm` token
  collision in `globals.css`) — needed for Phase 2's report modal, safe to do
  now since it's a one-line, isolated fix.

## 8. Known Phase 1 gaps (accepted, not blocking)

- With no Kader portal built yet, there's no UI for a kader to reply — I'll
  verify the receiving side of chat by inserting a test message directly via
  the Supabase dashboard/SQL, not through a real kader UI.
- `/student` and "Selesaikan Sesi" route to `/student/cerita-saya`, which
  doesn't exist until Phase 2. Phase 1 routes them to `/student/topik`
  instead, with a one-line TODO comment marking the swap for Phase 2.
- Report icon in the chat header is present but inert in Phase 1.

## 9. Phase 2 addendum (2026-08-28) — resolved during Phase 2 kickoff

Resolved while starting the Phase 2 implementation plan, after re-surveying the
codebase (Phase 1 has been live for a while; kader and guru portals landed in
the interim):

- **StudentShell nav is exactly 2 items**: "Ruang Chat" (`/student/cerita-saya`)
  and "Profil" (`/student/profil`). The `cerita_saya`/`profil_anonim` mockups'
  sidebar also shows Beranda/Jurnal/Materi/Settings/Logout and a "Buka Sesi
  Chat" button, none of which have any spec or scope — omitted rather than
  shipped as dead links, the same pattern already used for kader and guru.
- **Avatars render as an animal emoji inside a colored circle**, not custom
  inline-SVG illustrations. This still satisfies §7's actual requirement (no
  external avatar service, nothing ever leaves the app) while matching the
  initials-circle avatar style already used everywhere else in the app and
  avoiding bespoke illustration work for 8 icons. `src/lib/student/avatars.ts`
  maps each of the 8 seeds in `AVATAR_SEED_LABELS` to one emoji.
- **The Profil mockup's "Riwayat Aktivitas" button is omitted** — it isn't in
  §6/§7's scope and would just duplicate the "Ruang Chat" nav item.
- **The Cerita Saya mockup's filter icon is omitted** — §3 only calls for
  client-side search over the fetched list, not a separate filter control.
- **The chat header's report/flag icon does not exist yet.** §8's Phase-1 gap
  said it would be "present but disabled/hidden" — re-checking
  `src/components/student/ChatScreen.tsx` found no such icon at all. Phase 2
  adds it fresh (and wires it straight to the report `Modal`) rather than
  un-hiding something pre-existing.
- **The `laporkan_sesi` mockup leaves the "Lainnya" reason's optional detail
  field unimplemented** (its own code comment says so). Phase 2 fills this
  gap: selecting `reason: "other"` reveals a textarea bound to
  `submitSessionReport`'s optional `details` param; the other three reasons
  submit with no details field shown.
- **`Modal.tsx`'s `max-w-sm` → `max-w-[24rem]` fix (§7) is confirmed still
  needed** — not applied anywhere yet.
- Two other pre-existing, unrelated call sites still use the colliding
  `max-w-sm` Tailwind class (`src/app/kader/(protected)/layout.tsx`,
  `src/components/guru/ConsultationListScreen.tsx`) — out of scope for this
  phase, left as-is.
