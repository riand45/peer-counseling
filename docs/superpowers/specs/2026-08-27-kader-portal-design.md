# Kader Portal — Design

Date: 2026-08-27
Status: Approved by user, ready for implementation plan

## 1. Context & scope

The Kader portal is still a stub: `src/app/kader/(protected)/page.tsx` just renders
"Dashboard kader akan dibangun di sub-project berikutnya", and the layout's nav
only has Beranda + Profil (Profil has no route yet — 404). Foundation and the
Student Portal sub-project built everything a kader-side UI needs underneath
this: `profiles.status` (kader_status), `sessions.assigned_to`, RLS scoped to
`assigned_to = auth.uid()`, and — called out explicitly as a gap in the
Student Portal spec ("no UI for a kader to reply") — a shared chat transport
(`src/lib/chat/*`, `useSessionChat`) whose `resolveStaffActor()` already
resolves a `kader` actor from the session cookie. This spec covers building
the real thing against the 5 mockups in `design/kader/`: home dashboard
(`beranda_kader`), live chat (`ruang_chat_kader`), profile management
(`profil_kader`), transfer (`alihkan_konsultasi_kader`), and escalation
(`eskalasi_ke_guru_bk`).

Unlike the Student Portal, **no schema change is needed** — every table and
RLS policy this flow touches already exists.

### Delivery phasing

- **Phase 1** (this implementation plan): Beranda (dashboard, status toggle,
  active-consultation list) + Ruang Chat (reply, end session). A kader can log
  in, set Available/Busy/Offline, see their active sessions, open a chat, and
  reply or end it. The Alihkan and Hubungi Guru/BK buttons are present in the
  chat header but disabled — the same deferred-but-visible pattern the
  student chat used for its report icon in Phase 1.
- **Phase 2** (separate implementation plan, same spec): full Profil editing
  (bio, topics), Alihkan Konsultasi (transfer to another kader), Eskalasi ke
  Guru/BK (escalate).

## 2. Routes

- **`/kader`** (rewritten) — Beranda. Greeting, Available/Busy/Offline
  toggle (writes through `updateKaderStatus`), and a list of the kader's own
  active sessions (topic chip, student's display name, last-message preview,
  time) each linking to `/kader/chat/[sessionId]`. No "Menunggu" / queue
  section — see §6.
- **`/kader/chat/[sessionId]`** — Ruang Chat. `useSessionChat(sessionId)`
  (no `studentLocalId`, so it resolves the kader actor same as the guru
  path already does). Header: student's display name, topic chip, "Berlangsung"
  status, monitored-by-guru notice, "Selesaikan Sesi" (wired to
  `endKaderSession`), and disabled "Alihkan" / "Hubungi Guru/BK" buttons.
- **`/kader/profil`** — exists today only as a nav link with no route
  (404). Phase 1 ships a minimal but functional version: identity card
  (initials avatar, name, "Kader Aktif" badge) plus the *same*
  `StatusToggle` used on Beranda (one control, reused — not a second
  read-only copy), and a static note that bio/topic editing is coming.
  Phase 2 replaces the note with the real bio + topics editor from the
  mockup.

Phase 2 additions:

- **`/kader/alihkan/[sessionId]`** — list of other verified, available kader
  (reusing the shape of `listAvailableKader`, filtered to exclude self) with
  a confirm modal; on confirm, updates `sessions.assigned_to` and logs a
  `session_assignments` row (`reason = 'transfer'`).
- Escalation is a `Modal` opened from the chat header's "Hubungi Guru/BK"
  button, not a route — inserts into `escalations` (the existing
  `on_escalation_created` trigger flips `sessions.status` to `'escalated'`
  automatically).

## 3. Student display name

Kader never see a student's real identity — only `student_identities.nickname`
(optional) and `avatar_seed` (one of `kucing`, `kelinci`, `rubah`, `beruang`,
`burung`, `rusa`, `panda`, `koala`, currently a private const inside
`student/actions.ts`). The mockups show whimsical names ("Sahabat Langit",
"Anonim_Biru") that don't map to any existing field, so Phase 1 derives one
instead of inventing a new pseudonym subsystem:

- Move `AVATAR_SEEDS` out of `student/actions.ts` into an exported
  `AVATAR_SEED_LABELS: Record<string, string>` map in `student/types.ts`
  (e.g. `kucing` → `"Kucing"`), and point `randomAvatarSeed()` at its keys —
  single source of truth instead of a second private list.
- Add `getStudentDisplayName(nickname: string | null, avatarSeed: string | null)`
  next to it: returns `nickname` if set, else `` `Anonim_${AVATAR_SEED_LABELS[avatarSeed] ?? "Siswa"}` ``.
  Used on both the Beranda session cards and the chat header.

## 4. New Server Actions

All in `src/lib/kader/actions.ts`, `"use server"`. Unlike the student actions
(which always go through `createServiceClient()` because students aren't
Supabase-authenticated), these use the **authenticated** client from
`createClient()` so RLS does the authorization — no manual ownership checks
needed, mirroring how `chat/actions.ts` already treats the kader actor.

- **`getKaderDashboard()`** → own `profiles` row (`full_name`, `status`) +
  `sessions` where `assigned_to = auth.uid() and status = 'active'`, each
  with its latest message (one query on `messages` filtered `session_id in
  (...)`, reduced to latest-per-session in JS) and topics. `student_local_id`
  values collected from that RLS-scoped session list are then looked up in
  `student_identities` **via the service client** (that table has no
  `authenticated` grant at all, so this is the only way to read a nickname —
  safe here because the id list itself came from a query RLS already
  restricted to this kader's own sessions, not from client input).
- **`updateKaderStatus(status: KaderStatus)`** → `update profiles set status
  = ... where id = auth.uid()`. RLS allows self-update; the privileged-column
  trigger only guards `role`/`is_verified`, so `status` passes through.
  Revalidates `/kader`.
- **`endKaderSession({ sessionId })`** → `update sessions set status =
  'ended', ended_at = now() where id = sessionId`, relying on the existing
  "kader update sesi sendiri" policy (`assigned_to = auth.uid()`) to reject
  sessions that aren't this kader's; throws if the update matches zero rows.
- **`getSessionStudentInfo({ sessionId })`** → same two-client shape as the
  dashboard: authenticated client fetches `topics`, `status`,
  `student_local_id` from `sessions` (RLS-gated — 404s as "Sesi tidak
  ditemukan" if this kader isn't `assigned_to`), then the service client
  looks up just that one already-authorized `student_local_id` in
  `student_identities` for nickname/avatar_seed.

Chat itself needs no new actions — `sendMessage`, `getSessionMessages`, and
`useSessionChat` already work unmodified for a kader actor.

## 5. Components

- `src/components/kader/StatusToggle.tsx` — the Available/Busy/Offline
  control, shared between Beranda and Profil, calling `updateKaderStatus`.
- `src/components/kader/SessionCard.tsx` — one active-consultation card
  (Beranda list).
- `src/components/kader/ChatScreen.tsx` — structured like
  `student/ChatScreen.tsx` (same message-list/textarea/send shape) but with
  its own header (chip + 3 action buttons vs. the student header's single
  "Selesaikan Sesi") and identity resolution via `getSessionStudentInfo`
  instead of `getStudentLocalId`/`getSessionKader`. Kept separate rather than
  unified with the student screen — the headers diverge enough (1 action vs.
  3, different chip) that sharing would cost more prop-drilling than it'd
  save, and each stays a single-call-site component that's easy to read
  start to finish.
- Reused as-is: `Button`, `Card`, `Chip`, `ChatBubble`, `Modal` (Phase 2),
  `KaderShell`/`AppShell`.

## 6. Known Phase 1 gaps (accepted, not blocking)

- **No "Menunggu" / queue section on Beranda.** The mockup's "Terima" button
  implies an unassigned-session queue that doesn't exist in the current
  design: `startSession` always creates a session already `assigned_to` a
  specific kader the student chose directly, and the Student Portal spec
  explicitly parked `sessions.status = 'waiting'` for "a possible future
  queue-based flow" that was never built. Building "Terima" now would mean
  designing that whole matching system from scratch — out of scope here.
  Revisit only if a queue-based assignment sub-project is ever greenlit.
- **No "Ruang Chat" index nav destination.** The mockups' sidebar has a
  standalone "Ruang Chat" link; there's no separate chat-list screen to send
  it to since Beranda's active-consultation cards already link straight into
  each session. Omitted rather than added as a dead link.
- Alihkan and Hubungi Guru/BK buttons are visible in the Phase 1 chat header
  but inert (disabled, no handler).
- `/kader/profil` in Phase 1 shows identity + the functional status toggle
  only; bio and topics stay read-only/absent until Phase 2.
- Beranda's active-session list is fetched on load/navigation only, no
  realtime subscription — consistent with Foundation §7's "no live presence
  subscription" call for the student side. Only the chat screen itself is
  realtime (via the existing broadcast channel).
