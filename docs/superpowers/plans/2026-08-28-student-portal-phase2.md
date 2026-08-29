# Student Portal Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cerita Saya (session history), Profil Anonim (nickname + avatar editing, account deletion), and Laporkan Sesi (report modal) to the student portal, replacing Phase 1's `/student/topik` redirect fallbacks with the real destinations now that they exist.

**Architecture:** Five new Server Actions land directly in the existing `src/lib/student/actions.ts` (no `core.ts` split — every student action already uses the service-role client uniformly with no per-caller-identity branching, unlike kader/guru, so the extra indirection wouldn't add value; this matches Phase 1's own established pattern). New `src/components/student/` screens/components reuse the existing `Button`/`Card`/`Chip`/`Modal` primitives and the just-introduced `StudentShell`. A new `useRequireStudentIdentity` hook consolidates the "read localStorage, redirect to `/student` if missing" check that Phase 1's `ChatScreen.tsx` already does inline and two new screens now also need.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres, service-role client — students have no Supabase Auth), TypeScript, Tailwind v4, Vitest for integration tests against a real Supabase project (no schema changes in this plan).

**Spec:** `docs/superpowers/specs/2026-08-27-student-portal-design.md` (see §9, the Phase 2 addendum, for decisions resolved just before this plan was written)

## Global Constraints

- No schema/migration changes — every table, column, and RLS/grant this plan touches already exists in `supabase/schema.sql`.
- All student Server Actions use `createServiceClient()` — students have no Supabase Auth session, so there is no authenticated client available to them. Every action that touches a specific student's data takes `studentLocalId` and validates it against the row's own id/`student_local_id` before acting (matching the existing `endSession`/`getSessionKader` pattern in `src/lib/student/actions.ts`) — never trust a client-supplied id without that check.
- Reuse existing domain types/constants — `Topic`, `TOPIC_LABELS`, `TOPIC_EMOJI`, `KaderStatus`, `AVATAR_SEED_LABELS`, `getStudentDisplayName` from `@/lib/student/types`; `SessionStatus`, `SESSION_STATUS_LABELS`, `SESSION_STATUS_TONES` from `@/lib/kader/types` (relocated there in Task 1) — do not redefine them.
- All user-facing copy and thrown error messages are Bahasa Indonesia, matching the rest of the app.
- **StudentShell's nav is exactly 2 items** — "Ruang Chat" (`/student/cerita-saya`) and "Profil" (`/student/profil`). Do not add Beranda/Jurnal/Materi/Settings/Logout nav items or a persistent sidebar "Buka Sesi Chat" button — none have any spec or scope (see spec §9).
- **Avatars render as an emoji inside a colored circle**, not custom inline-SVG illustrations (see spec §9) — `src/lib/student/avatars.ts` maps each of the 8 seeds already in `AVATAR_SEED_LABELS` to one emoji.
- Never nest a `Button`/`<button>` inside a `Link`/`<a>` — where a card or row needs both a navigation target and a styled "button-like" appearance, style the `Link` directly instead of wrapping a `Button` component (an accessibility/HTML-validity anti-pattern flagged repeatedly in the kader/guru sub-projects' code reviews).

---

### Task 1: Shared session-status labels relocation + new student types

**Files:**
- Modify: `src/lib/kader/types.ts`
- Modify: `src/lib/guru/types.ts`
- Modify: `src/lib/student/types.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `SESSION_STATUS_LABELS`, `SESSION_STATUS_TONES` now live on `@/lib/kader/types` (re-exported from `@/lib/guru/types` unchanged, so existing guru imports keep working with zero changes to guru's already-shipped component files); `ReportReason`, `REPORT_REASON_LABELS`, `StudentSessionSummary`, `StudentProfile` types from `@/lib/student/types`. Tasks 4-13 consume these.

- [ ] **Step 1: Move the two label maps into `kader/types.ts`**

`SESSION_STATUS_LABELS`/`SESSION_STATUS_TONES` currently live in `src/lib/guru/types.ts`, but the Student module now needs them too, and a student→guru import would be a backwards dependency (student is the more foundational role). `SessionStatus` itself already lives in `src/lib/kader/types.ts` — move the two maps there, next to it.

Append to `src/lib/kader/types.ts` (after the existing `SessionStatus` type):

```typescript
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

- [ ] **Step 2: Re-export them from `guru/types.ts` instead of defining them there**

In `src/lib/guru/types.ts`, replace these lines:

```typescript
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

with:

```typescript
export { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/kader/types";
```

Every existing guru file that does `import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/guru/types";` (`ActivityTable.tsx`, `ConsultationTable.tsx`, `ConsultationDetailScreen.tsx`) needs no changes — the re-export keeps that import path working identically.

- [ ] **Step 3: Add the new student types**

Append to `src/lib/student/types.ts`:

```typescript
import type { SessionStatus } from "@/lib/kader/types";

export type StudentSessionSummary = {
  id: string;
  topics: Topic[];
  kaderName: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  status: SessionStatus;
};

export type ReportReason = "uncomfortable" | "unresponsive" | "need_teacher" | "other";

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  uncomfortable: "Saya merasa tidak nyaman",
  unresponsive: "Kader tidak merespons",
  need_teacher: "Saya ingin bantuan guru/BK",
  other: "Lainnya",
};

export type StudentProfile = {
  nickname: string | null;
  avatarSeed: string;
};
```

(Add the `import type { SessionStatus } from "@/lib/kader/types";` line near the top of the file, alongside — not merged into — the file's existing type definitions, since `types.ts` currently has no imports at all.)

- [ ] **Step 4: Verify it type-checks and existing tests still pass**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx vitest run tests/kader-actions.test.ts tests/guru-actions.test.ts tests/student-types.test.ts`
Expected: PASS — confirms the guru re-export didn't break anything guru-side, and existing student types are unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kader/types.ts src/lib/guru/types.ts src/lib/student/types.ts
git commit -m "feat(student): relocate session-status labels to kader/types, add Phase 2 types"
```

---

### Task 2: Avatar emoji map + cycle helper + tests

**Files:**
- Create: `src/lib/student/avatars.ts`
- Test: `tests/student-avatars.test.ts` (new)

**Interfaces:**
- Consumes: `AVATAR_SEED_LABELS` (existing) from `@/lib/student/types`.
- Produces: `AVATAR_EMOJI: Record<string, string>`, `nextAvatarSeed(current: string): string` from `@/lib/student/avatars`. Task 9 (`AvatarIcon`) and Task 12 (`ProfilScreen`) consume these.

- [ ] **Step 1: Write the failing test**

Create `tests/student-avatars.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { AVATAR_EMOJI, nextAvatarSeed } from "@/lib/student/avatars";
import { AVATAR_SEED_LABELS } from "@/lib/student/types";

describe("AVATAR_EMOJI", () => {
  it("has an emoji for every seed in AVATAR_SEED_LABELS", () => {
    for (const seed of Object.keys(AVATAR_SEED_LABELS)) {
      expect(AVATAR_EMOJI[seed]).toBeTruthy();
    }
  });
});

describe("nextAvatarSeed", () => {
  it("cycles to the next seed in order", () => {
    const seeds = Object.keys(AVATAR_SEED_LABELS);
    expect(nextAvatarSeed(seeds[0])).toBe(seeds[1]);
  });

  it("wraps around from the last seed back to the first", () => {
    const seeds = Object.keys(AVATAR_SEED_LABELS);
    expect(nextAvatarSeed(seeds[seeds.length - 1])).toBe(seeds[0]);
  });

  it("starts at the first seed when given an unknown seed", () => {
    const seeds = Object.keys(AVATAR_SEED_LABELS);
    expect(nextAvatarSeed("unknown-seed")).toBe(seeds[0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/student-avatars.test.ts`
Expected: FAIL — `@/lib/student/avatars` does not exist yet.

- [ ] **Step 3: Implement**

Create `src/lib/student/avatars.ts`:

```typescript
import { AVATAR_SEED_LABELS } from "./types";

export const AVATAR_EMOJI: Record<string, string> = {
  kucing: "🐱",
  kelinci: "🐰",
  rubah: "🦊",
  beruang: "🐻",
  burung: "🐦",
  rusa: "🦌",
  panda: "🐼",
  koala: "🐨",
};

const AVATAR_SEEDS = Object.keys(AVATAR_SEED_LABELS);

export function nextAvatarSeed(current: string): string {
  const index = AVATAR_SEEDS.indexOf(current);
  const nextIndex = index === -1 ? 0 : (index + 1) % AVATAR_SEEDS.length;
  return AVATAR_SEEDS[nextIndex];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/student-avatars.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/student/avatars.ts tests/student-avatars.test.ts
git commit -m "feat(student): add avatar emoji map and cycle helper"
```

---

### Task 3: `clearStudentLocalId` in identity.ts

**Files:**
- Modify: `src/lib/student/identity.ts`

**Interfaces:**
- Produces: `clearStudentLocalId(): void` from `@/lib/student/identity`. Task 12 (`ProfilScreen`'s "Hapus Akun Anonim") consumes this.

- [ ] **Step 1: Implement**

`src/lib/student/identity.ts` currently reads:

```typescript
const STORAGE_KEY = "ruang-cerita:student-id";

export function getStudentLocalId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setStudentLocalId(id: string): void {
  window.localStorage.setItem(STORAGE_KEY, id);
}
```

Append:

```typescript
export function clearStudentLocalId(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}
```

(No existing tests cover `identity.ts` — it's a trivial browser-storage wrapper untestable in this project's Node-environment vitest setup, same as `getStudentLocalId`/`setStudentLocalId` already are. Consistent with that precedent, this function isn't given a dedicated test either.)

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/student/identity.ts
git commit -m "feat(student): add clearStudentLocalId for account deletion"
```

---

### Task 4: `getStudentSessions` action + tests

**Files:**
- Modify: `src/lib/student/actions.ts`
- Test: `tests/student-actions.test.ts`

**Interfaces:**
- Consumes: `StudentSessionSummary` (Task 1) from `./types`; `getServiceClient`, `createTestStudentIdentity`, `deleteTestStudentIdentity`, `createTestUser`, `deleteTestUser`, `createTestSession`, `deleteTestSession` from `./helpers`.
- Produces: `getStudentSessions(input: { studentLocalId: string }): Promise<StudentSessionSummary[]>` from `@/lib/student/actions`. Task 11 (`CeritaSayaScreen`) consumes this.

- [ ] **Step 1: Write the failing test**

Add to `tests/student-actions.test.ts`:

```typescript
import { getStudentSessions } from "@/lib/student/actions";

describe("getStudentSessions", () => {
  it("returns this student's sessions with kader name, topics, status, and latest message", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const kader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kader.id));
      const service = getServiceClient();
      await service.from("profiles").update({ full_name: "Nadia" }).eq("id", kader.id);

      const sessionId = await createTestSession({
        studentLocalId: localId,
        assignedTo: kader.id,
        topics: ["akademik"],
      });
      cleanup.push(() => deleteTestSession(sessionId));
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);
      await service.from("messages").insert({ session_id: sessionId, sender_role: "kader", body: "Halo!" });

      const result = await getStudentSessions({ studentLocalId: localId });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(sessionId);
      expect(result[0].kaderName).toBe("Nadia");
      expect(result[0].topics).toEqual(["akademik"]);
      expect(result[0].status).toBe("active");
      expect(result[0].lastMessagePreview).toBe("Halo!");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
    }
  });

  it("excludes other students' sessions", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const otherLocalId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(otherLocalId));

      const otherSessionId = await createTestSession({ studentLocalId: otherLocalId });
      cleanup.push(() => deleteTestSession(otherSessionId));

      const result = await getStudentSessions({ studentLocalId: localId });
      expect(result).toEqual([]);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
    }
  });
});
```

(Add the `import { getStudentSessions } from "@/lib/student/actions";` line alongside the existing action imports at the top of the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/student-actions.test.ts -t getStudentSessions`
Expected: FAIL — `getStudentSessions` is not exported from `@/lib/student/actions`.

- [ ] **Step 3: Implement**

Append to `src/lib/student/actions.ts`:

```typescript
import type { StudentSessionSummary } from "./types";

export async function getStudentSessions(input: {
  studentLocalId: string;
}): Promise<StudentSessionSummary[]> {
  const service = createServiceClient();

  const { data: sessions, error } = await service
    .from("sessions")
    .select("id, topics, status, assigned_to, last_message_at")
    .eq("student_local_id", input.studentLocalId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("getStudentSessions failed:", error);
    throw new Error("Gagal memuat riwayat cerita");
  }

  const sessionRows = sessions ?? [];

  const kaderIds = [
    ...new Set(
      sessionRows
        .map((row) => row.assigned_to as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const kaderNameById = new Map<string, string>();
  if (kaderIds.length > 0) {
    const { data: kaderProfiles } = await service
      .from("profiles")
      .select("id, full_name")
      .in("id", kaderIds);
    for (const row of kaderProfiles ?? []) {
      kaderNameById.set(row.id as string, (row.full_name as string | null) ?? "Kader");
    }
  }

  const sessionIds = sessionRows.map((row) => row.id as string);
  const latestMessageBySession = new Map<string, { body: string; created_at: string }>();
  if (sessionIds.length > 0) {
    const { data: messages } = await service
      .from("messages")
      .select("session_id, body, created_at")
      .in("session_id", sessionIds)
      .order("created_at", { ascending: false });
    for (const message of messages ?? []) {
      const sid = message.session_id as string;
      if (!latestMessageBySession.has(sid)) {
        latestMessageBySession.set(sid, {
          body: message.body as string,
          created_at: message.created_at as string,
        });
      }
    }
  }

  return sessionRows.map((row) => {
    const assignedTo = row.assigned_to as string | null;
    const latest = latestMessageBySession.get(row.id as string);
    return {
      id: row.id as string,
      topics: (row.topics as Topic[]) ?? [],
      kaderName: assignedTo ? kaderNameById.get(assignedTo) ?? null : null,
      lastMessagePreview: latest?.body ?? null,
      lastMessageAt: (row.last_message_at as string | null) ?? latest?.created_at ?? null,
      status: row.status as StudentSessionSummary["status"],
    };
  });
}
```

(Merge the `import type { StudentSessionSummary } from "./types";` into the existing `import type { Topic, KaderSummary, KaderStatus } from "./types";` line, making it one combined import from `"./types"`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/student-actions.test.ts`
Expected: PASS (all tests, including pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/student/actions.ts tests/student-actions.test.ts
git commit -m "feat(student): add getStudentSessions for the Cerita Saya screen"
```

---

### Task 5: `getStudentProfile` + `updateStudentProfile` actions + tests

**Files:**
- Modify: `src/lib/student/actions.ts`
- Test: `tests/student-actions.test.ts`

**Interfaces:**
- Consumes: `StudentProfile` (Task 1) from `./types`; `randomUUID` from `node:crypto` (already imported in the test file).
- Produces: `getStudentProfile(input: { studentLocalId: string }): Promise<StudentProfile>`, `updateStudentProfile(input: { studentLocalId: string; nickname?: string; avatarSeed?: string }): Promise<void>` from `@/lib/student/actions`. Task 12 (`ProfilScreen`) consumes both.

- [ ] **Step 1: Write the failing test**

Add to `tests/student-actions.test.ts`:

```typescript
import { getStudentProfile, updateStudentProfile } from "@/lib/student/actions";

describe("getStudentProfile", () => {
  it("returns the nickname and avatar seed for an existing identity", async () => {
    const localId = await createTestStudentIdentity();
    try {
      const service = getServiceClient();
      await service
        .from("student_identities")
        .update({ nickname: "Sahabat Langit", avatar_seed: "panda" })
        .eq("id", localId);

      const profile = await getStudentProfile({ studentLocalId: localId });
      expect(profile.nickname).toBe("Sahabat Langit");
      expect(profile.avatarSeed).toBe("panda");
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });

  it("throws for an identity that does not exist", async () => {
    await expect(getStudentProfile({ studentLocalId: randomUUID() })).rejects.toThrow(
      "Identitas tidak ditemukan",
    );
  });
});

describe("updateStudentProfile", () => {
  it("updates the nickname", async () => {
    const localId = await createTestStudentIdentity();
    try {
      await updateStudentProfile({ studentLocalId: localId, nickname: "Bintang Malam" });
      const service = getServiceClient();
      const { data } = await service
        .from("student_identities")
        .select("nickname")
        .eq("id", localId)
        .single();
      expect(data?.nickname).toBe("Bintang Malam");
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });

  it("clears the nickname when given a whitespace-only string", async () => {
    const localId = await createTestStudentIdentity();
    try {
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: "Ada Nama" }).eq("id", localId);

      await updateStudentProfile({ studentLocalId: localId, nickname: "  " });
      const { data } = await service
        .from("student_identities")
        .select("nickname")
        .eq("id", localId)
        .single();
      expect(data?.nickname).toBeNull();
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });

  it("updates the avatar seed when it is a known seed", async () => {
    const localId = await createTestStudentIdentity();
    try {
      await updateStudentProfile({ studentLocalId: localId, avatarSeed: "koala" });
      const service = getServiceClient();
      const { data } = await service
        .from("student_identities")
        .select("avatar_seed")
        .eq("id", localId)
        .single();
      expect(data?.avatar_seed).toBe("koala");
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });

  it("rejects an unknown avatar seed", async () => {
    const localId = await createTestStudentIdentity();
    try {
      await expect(
        updateStudentProfile({ studentLocalId: localId, avatarSeed: "naga" }),
      ).rejects.toThrow("Avatar tidak dikenal");
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });
});
```

(Add the `import { getStudentProfile, updateStudentProfile } from "@/lib/student/actions";` line alongside the other action imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/student-actions.test.ts -t getStudentProfile`
Expected: FAIL — `getStudentProfile` is not exported from `@/lib/student/actions`.

- [ ] **Step 3: Implement**

Append to `src/lib/student/actions.ts`:

```typescript
import type { StudentProfile } from "./types";

export async function getStudentProfile(input: {
  studentLocalId: string;
}): Promise<StudentProfile> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("student_identities")
    .select("nickname, avatar_seed")
    .eq("id", input.studentLocalId)
    .single();

  if (error || !data) {
    throw new Error("Identitas tidak ditemukan");
  }

  return {
    nickname: data.nickname as string | null,
    avatarSeed: (data.avatar_seed as string | null) ?? "kucing",
  };
}

export async function updateStudentProfile(input: {
  studentLocalId: string;
  nickname?: string;
  avatarSeed?: string;
}): Promise<void> {
  if (input.avatarSeed && !(input.avatarSeed in AVATAR_SEED_LABELS)) {
    throw new Error("Avatar tidak dikenal");
  }

  const update: Record<string, unknown> = {};
  if (input.nickname !== undefined) {
    update.nickname = input.nickname.trim() || null;
  }
  if (input.avatarSeed !== undefined) {
    update.avatar_seed = input.avatarSeed;
  }

  const service = createServiceClient();
  const { error } = await service
    .from("student_identities")
    .update(update)
    .eq("id", input.studentLocalId);

  if (error) {
    console.error("updateStudentProfile failed:", error);
    throw new Error("Gagal memperbarui profil");
  }
}
```

(Merge the `import type { StudentProfile } from "./types";` into the combined `"./types"` import line from Task 4.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/student-actions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/student/actions.ts tests/student-actions.test.ts
git commit -m "feat(student): add getStudentProfile and updateStudentProfile actions"
```

---

### Task 6: `deleteStudentIdentity` action + tests

**Files:**
- Modify: `src/lib/student/actions.ts`
- Test: `tests/student-actions.test.ts`

**Interfaces:**
- Produces: `deleteStudentIdentity(input: { studentLocalId: string }): Promise<void>` from `@/lib/student/actions`. Task 12 (`ProfilScreen`'s "Hapus Akun Anonim") consumes this.

- [ ] **Step 1: Write the failing test**

Add to `tests/student-actions.test.ts`:

```typescript
import { deleteStudentIdentity } from "@/lib/student/actions";

describe("deleteStudentIdentity", () => {
  it("deletes the identity and cascades to delete its sessions", async () => {
    const localId = await createTestStudentIdentity();
    const sessionId = await createTestSession({ studentLocalId: localId });
    try {
      await deleteStudentIdentity({ studentLocalId: localId });

      const service = getServiceClient();
      const { data: identity } = await service
        .from("student_identities")
        .select("id")
        .eq("id", localId)
        .maybeSingle();
      expect(identity).toBeNull();

      const { data: session } = await service
        .from("sessions")
        .select("id")
        .eq("id", sessionId)
        .maybeSingle();
      expect(session).toBeNull();
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });
});
```

(Add the `import { deleteStudentIdentity } from "@/lib/student/actions";` line alongside the other action imports. The `finally` block's cleanup call is a safety net in case the assertions fail before the delete is confirmed — deleting an already-deleted row is a harmless no-op, not an error.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/student-actions.test.ts -t deleteStudentIdentity`
Expected: FAIL — `deleteStudentIdentity` is not exported from `@/lib/student/actions`.

- [ ] **Step 3: Implement**

Append to `src/lib/student/actions.ts`:

```typescript
export async function deleteStudentIdentity(input: { studentLocalId: string }): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from("student_identities")
    .delete()
    .eq("id", input.studentLocalId);

  if (error) {
    console.error("deleteStudentIdentity failed:", error);
    throw new Error("Gagal menghapus akun");
  }
}
```

(`sessions.student_local_id references student_identities(id) on delete cascade` and `messages.session_id references sessions(id) on delete cascade` — both already in `supabase/schema.sql` — mean this one delete cascades through the student's sessions and messages automatically; no manual cleanup needed here.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/student-actions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/student/actions.ts tests/student-actions.test.ts
git commit -m "feat(student): add deleteStudentIdentity action"
```

---

### Task 7: `submitSessionReport` action + tests

**Files:**
- Modify: `src/lib/student/actions.ts`
- Test: `tests/student-actions.test.ts`

**Interfaces:**
- Consumes: `ReportReason` (Task 1) from `./types`.
- Produces: `submitSessionReport(input: { sessionId: string; studentLocalId: string; reason: ReportReason; details?: string }): Promise<void>` from `@/lib/student/actions`. Task 13 (`ReportModal`) consumes this.

- [ ] **Step 1: Write the failing test**

Add to `tests/student-actions.test.ts`:

```typescript
import { submitSessionReport } from "@/lib/student/actions";

describe("submitSessionReport", () => {
  it("inserts a session_reports row for the reporting student's own session", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await submitSessionReport({
        sessionId,
        studentLocalId: localId,
        reason: "other",
        details: "Detail tambahan",
      });

      const service = getServiceClient();
      const { data } = await service
        .from("session_reports")
        .select("reason, details, status")
        .eq("session_id", sessionId)
        .single();
      expect(data?.reason).toBe("other");
      expect(data?.details).toBe("Detail tambahan");
      expect(data?.status).toBe("open");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
    }
  });

  it("rejects reporting a session that belongs to a different student", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const otherLocalId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(otherLocalId));
      const sessionId = await createTestSession({ studentLocalId: otherLocalId });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(
        submitSessionReport({ sessionId, studentLocalId: localId, reason: "uncomfortable" }),
      ).rejects.toThrow("Tidak diizinkan");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
    }
  });
});
```

(Add the `import { submitSessionReport } from "@/lib/student/actions";` line alongside the other action imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/student-actions.test.ts -t submitSessionReport`
Expected: FAIL — `submitSessionReport` is not exported from `@/lib/student/actions`.

- [ ] **Step 3: Implement**

Append to `src/lib/student/actions.ts`:

```typescript
import type { ReportReason } from "./types";

export async function submitSessionReport(input: {
  sessionId: string;
  studentLocalId: string;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  const service = createServiceClient();

  const { data: session, error: sessionError } = await service
    .from("sessions")
    .select("student_local_id")
    .eq("id", input.sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error("Sesi tidak ditemukan");
  }
  if (session.student_local_id !== input.studentLocalId) {
    throw new Error("Tidak diizinkan melaporkan sesi ini");
  }

  const { error } = await service.from("session_reports").insert({
    session_id: input.sessionId,
    reason: input.reason,
    details: input.details?.trim() || null,
  });

  if (error) {
    console.error("submitSessionReport failed:", error);
    throw new Error("Gagal mengirim laporan");
  }
}
```

(Merge the `import type { ReportReason } from "./types";` into the combined `"./types"` import line.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/student-actions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in `tests/chat.test.ts`, `tests/kader-actions.test.ts`, `tests/guru-actions.test.ts`, `tests/schema.test.ts`, `tests/student-types.test.ts`, `tests/student-avatars.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/student/actions.ts tests/student-actions.test.ts
git commit -m "feat(student): add submitSessionReport action"
```

---

### Task 8: `useRequireStudentIdentity` hook + refactor ChatScreen to use it

**Files:**
- Create: `src/lib/student/useRequireStudentIdentity.ts`
- Modify: `src/components/student/ChatScreen.tsx`

**Interfaces:**
- Consumes: `getStudentLocalId` from `@/lib/student/identity`.
- Produces: `useRequireStudentIdentity(): string | null` from `@/lib/student/useRequireStudentIdentity`. Task 11 (`CeritaSayaScreen`) and Task 12 (`ProfilScreen`) consume this; this task also switches `ChatScreen.tsx`'s existing inline version of the same check over to it.

- [ ] **Step 1: Implement the hook**

Create `src/lib/student/useRequireStudentIdentity.ts`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStudentLocalId } from "./identity";

export function useRequireStudentIdentity(): string | null {
  const router = useRouter();
  const [studentLocalId, setStudentLocalId] = useState<string | null>(null);

  useEffect(() => {
    const id = getStudentLocalId();
    if (!id) {
      router.replace("/student");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deferring a client-only localStorage read to avoid a server/client hydration mismatch; not a cascading-render risk (fires once per mount)
    setStudentLocalId(id);
  }, [router]);

  return studentLocalId;
}
```

This is the exact same check `ChatScreen.tsx` already does inline (down to the lint-suppression comment) — extracted because Tasks 11 and 12 both need it too, which would make three near-identical copies without this extraction.

- [ ] **Step 2: Refactor `ChatScreen.tsx` to use it**

In `src/components/student/ChatScreen.tsx`, replace:

```tsx
export function ChatScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [studentLocalId, setLocalId] = useState<string | null>(null);

  useEffect(() => {
    const id = getStudentLocalId();
    if (!id) {
      router.replace("/student");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deferring a client-only localStorage read to avoid a server/client hydration mismatch; not a cascading-render risk (fires once per mount)
    setLocalId(id);
  }, [router]);

  if (!studentLocalId) {
    return null;
  }

  return <ChatSession sessionId={sessionId} studentLocalId={studentLocalId} />;
}
```

with:

```tsx
export function ChatScreen({ sessionId }: { sessionId: string }) {
  const studentLocalId = useRequireStudentIdentity();

  if (!studentLocalId) {
    return null;
  }

  return <ChatSession sessionId={sessionId} studentLocalId={studentLocalId} />;
}
```

Update the file's imports: remove `import { getStudentLocalId } from "@/lib/student/identity";` (no longer used anywhere in this file) and add `import { useRequireStudentIdentity } from "@/lib/student/useRequireStudentIdentity";`. Leave the `import { useEffect, useRef, useState } from "react";` line and the `useRouter` import untouched — `ChatSession` (the inner component, unchanged by this task) still uses all of them.

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. As a student with an existing local identity, open `/student/chat/<any-real-sessionId>` and confirm the chat screen still renders exactly as before (this task changes no behavior, only where the identity check lives). Clear the `ruang-cerita:student-id` key from your browser's localStorage and reload the same URL — confirm it redirects to `/student`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/student/useRequireStudentIdentity.ts src/components/student/ChatScreen.tsx
git commit -m "refactor(student): extract useRequireStudentIdentity, use it in ChatScreen"
```

---

### Task 9: `AvatarIcon` component

**Files:**
- Create: `src/components/student/AvatarIcon.tsx`

**Interfaces:**
- Consumes: `AVATAR_EMOJI` (Task 2) from `@/lib/student/avatars`; `cn` from `@/lib/cn`.
- Produces: `AvatarIcon({ seed: string, className?: string })`. Consumed by Task 12 (`ProfilScreen`).

- [ ] **Step 1: Implement**

Create `src/components/student/AvatarIcon.tsx`:

```tsx
import { cn } from "@/lib/cn";
import { AVATAR_EMOJI } from "@/lib/student/avatars";

export function AvatarIcon({ seed, className }: { seed: string; className?: string }) {
  const emoji = AVATAR_EMOJI[seed] ?? "🙂";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-28 w-28 items-center justify-center rounded-full bg-secondary-fixed text-6xl",
        className,
      )}
    >
      {emoji}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/student/AvatarIcon.tsx
git commit -m "feat(student): add AvatarIcon component"
```

---

### Task 10: `StudentSessionCard` component

**Files:**
- Create: `src/components/student/StudentSessionCard.tsx`

**Interfaces:**
- Consumes: `StudentSessionSummary` (Task 1) from `@/lib/student/types`; `SESSION_STATUS_LABELS`, `SESSION_STATUS_TONES` (Task 1) from `@/lib/kader/types`; `Card`, `Chip` from `@/components/ui/*`; `TOPIC_EMOJI`, `TOPIC_LABELS` from `@/lib/student/types`.
- Produces: `StudentSessionCard({ session: StudentSessionSummary })`. Consumed by Task 11 (`CeritaSayaScreen`).

- [ ] **Step 1: Implement**

Create `src/components/student/StudentSessionCard.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/kader/types";
import { TOPIC_EMOJI, TOPIC_LABELS } from "@/lib/student/types";
import type { StudentSessionSummary } from "@/lib/student/types";

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StudentSessionCard({ session }: { session: StudentSessionSummary }) {
  const primaryTopic = session.topics[0];

  return (
    <Link href={`/student/chat/${session.id}`}>
      <Card className="flex flex-col gap-2 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-label-md font-semibold text-on-surface">{session.kaderName ?? "Kader"}</p>
            {primaryTopic && (
              <Chip tone="secondary" className="mt-1">
                {TOPIC_EMOJI[primaryTopic]} {TOPIC_LABELS[primaryTopic]}
              </Chip>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <Chip tone={SESSION_STATUS_TONES[session.status]}>{SESSION_STATUS_LABELS[session.status]}</Chip>
            <span className="text-label-sm text-on-surface-variant">{formatTime(session.lastMessageAt)}</span>
          </div>
        </div>
        {session.lastMessagePreview && (
          <p className="truncate text-body-md text-on-surface-variant">{session.lastMessagePreview}</p>
        )}
      </Card>
    </Link>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/student/StudentSessionCard.tsx
git commit -m "feat(student): add StudentSessionCard component"
```

---

### Task 11: CeritaSayaScreen — wire Ruang Chat (session history) together

**Files:**
- Create: `src/components/student/CeritaSayaScreen.tsx`
- Create: `src/app/student/(shell)/layout.tsx`
- Create: `src/app/student/(shell)/cerita-saya/page.tsx`

**Interfaces:**
- Consumes: `getStudentSessions` (Task 4) from `@/lib/student/actions`; `useRequireStudentIdentity` (Task 8) from `@/lib/student/useRequireStudentIdentity`; `StudentSessionCard` (Task 10); `StudentShell` from `@/components/shells/StudentShell`; `StudentSessionSummary` from `@/lib/student/types`.
- Produces: `CeritaSayaScreen()` — self-fetching client component; the `/student/cerita-saya` route; the `(shell)` route group's `layout.tsx`, which Task 12 (`ProfilScreen`) also lives under.

- [ ] **Step 1: Implement the screen**

Create `src/components/student/CeritaSayaScreen.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStudentSessions } from "@/lib/student/actions";
import { useRequireStudentIdentity } from "@/lib/student/useRequireStudentIdentity";
import { StudentSessionCard } from "./StudentSessionCard";
import type { StudentSessionSummary } from "@/lib/student/types";

const NEW_STORY_LINK_CLASSES =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-label-md font-semibold text-on-primary transition-colors hover:bg-primary-container";

export function CeritaSayaScreen() {
  const studentLocalId = useRequireStudentIdentity();
  const [search, setSearch] = useState("");
  const [sessions, setSessions] = useState<StudentSessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!studentLocalId) return;
    getStudentSessions({ studentLocalId })
      .then(setSessions)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat riwayat cerita"));
  }, [studentLocalId]);

  if (!studentLocalId) {
    return null;
  }

  if (error) {
    return (
      <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
        {error}
      </p>
    );
  }

  if (!sessions) {
    return <p className="text-body-md text-on-surface-variant">Memuat riwayat cerita...</p>;
  }

  const filtered = search.trim()
    ? sessions.filter((s) => (s.kaderName ?? "").toLowerCase().includes(search.trim().toLowerCase()))
    : sessions;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">Ruang Chat</h1>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Lanjutkan percakapanmu atau mulai obrolan baru dengan Peer Counselor kami.
          </p>
        </div>
        <Link href="/student/topik" className={NEW_STORY_LINK_CLASSES}>
          + Cerita Baru
        </Link>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Cari percakapan..."
        className="rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-outline-variant py-16 text-center">
          <p className="max-w-sm text-body-md text-on-surface-variant">
            Belum ada cerita. Kalau ada sesuatu yang ingin kamu sampaikan, kamu bisa mulai kapan saja.
          </p>
          <Link href="/student/topik" className={NEW_STORY_LINK_CLASSES}>
            Mulai Cerita Baru
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {filtered.map((session) => (
            <StudentSessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the shell layout**

Create `src/app/student/(shell)/layout.tsx`:

```tsx
import { StudentShell } from "@/components/shells/StudentShell";

const navItems = [
  { href: "/student/cerita-saya", label: "Ruang Chat", icon: "💬" },
  { href: "/student/profil", label: "Profil", icon: "🙂" },
];

export default function StudentShellLayout({ children }: { children: React.ReactNode }) {
  return <StudentShell navItems={navItems}>{children}</StudentShell>;
}
```

This is the first route to use `StudentShell` (Task 12's Profil page joins it below). Unlike the kader/guru `(protected)` layouts, this does no auth check — students have no Supabase Auth session to check server-side; the "no identity yet" redirect happens client-side, per-screen, via `useRequireStudentIdentity`.

- [ ] **Step 3: Add the route**

Create `src/app/student/(shell)/cerita-saya/page.tsx`:

```tsx
import { CeritaSayaScreen } from "@/components/student/CeritaSayaScreen";

export default function CeritaSayaPage() {
  return <CeritaSayaScreen />;
}
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual check**

Run: `npm run dev`. As a student with an existing local identity (or create one via `/student`), navigate to `/student/cerita-saya`. Confirm the `StudentShell` sidebar/bottom-nav shows exactly "Ruang Chat" and "Profil". Confirm the empty state renders if you have no sessions, or your session list otherwise. Create a test session assigned to a kader via the Supabase dashboard if you want to see a populated card, and confirm the search box filters by kader name.

- [ ] **Step 6: Commit**

```bash
git add src/components/student/CeritaSayaScreen.tsx "src/app/student/(shell)/layout.tsx" "src/app/student/(shell)/cerita-saya/page.tsx"
git commit -m "feat(student): add Cerita Saya (session history) screen and route"
```

---

### Task 12: ProfilScreen — wire Profil Anonim together

**Files:**
- Create: `src/components/student/ProfilScreen.tsx`
- Create: `src/app/student/(shell)/profil/page.tsx`

**Interfaces:**
- Consumes: `getStudentProfile`, `updateStudentProfile`, `deleteStudentIdentity` (Tasks 5-6) from `@/lib/student/actions`; `useRequireStudentIdentity` (Task 8); `AvatarIcon` (Task 9); `nextAvatarSeed` (Task 2) from `@/lib/student/avatars`; `clearStudentLocalId` (Task 3) from `@/lib/student/identity`; `getStudentDisplayName` from `@/lib/student/types`; `Button`, `Card`, `Modal` from `@/components/ui/*`.
- Produces: `ProfilScreen()`; the `/student/profil` route.

- [ ] **Step 1: Implement the screen**

Create `src/components/student/ProfilScreen.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { AvatarIcon } from "./AvatarIcon";
import { useRequireStudentIdentity } from "@/lib/student/useRequireStudentIdentity";
import { deleteStudentIdentity, getStudentProfile, updateStudentProfile } from "@/lib/student/actions";
import { getStudentDisplayName } from "@/lib/student/types";
import { nextAvatarSeed } from "@/lib/student/avatars";
import { clearStudentLocalId } from "@/lib/student/identity";
import type { StudentProfile } from "@/lib/student/types";

export function ProfilScreen() {
  const router = useRouter();
  const studentLocalId = useRequireStudentIdentity();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftNickname, setDraftNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [cycling, setCycling] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!studentLocalId) return;
    getStudentProfile({ studentLocalId })
      .then(setProfile)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat profil"));
  }, [studentLocalId]);

  if (!studentLocalId) {
    return null;
  }

  if (error) {
    return (
      <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
        {error}
      </p>
    );
  }

  if (!profile) {
    return <p className="text-body-md text-on-surface-variant">Memuat profil...</p>;
  }

  async function handleCycleAvatar() {
    const seed = nextAvatarSeed(profile.avatarSeed);
    setCycling(true);
    setError(null);
    try {
      await updateStudentProfile({ studentLocalId, avatarSeed: seed });
      setProfile({ ...profile, avatarSeed: seed });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengganti avatar");
    } finally {
      setCycling(false);
    }
  }

  async function handleSaveNickname() {
    setSaving(true);
    setError(null);
    try {
      await updateStudentProfile({ studentLocalId, nickname: draftNickname });
      setProfile({ ...profile, nickname: draftNickname.trim() || null });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan nama panggilan");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await deleteStudentIdentity({ studentLocalId });
      clearStudentLocalId();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus akun");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const displayName = getStudentDisplayName(profile.nickname, profile.avatarSeed);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">Profil Anonim</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Identitasmu tetap rahasia. Kamu bisa mengubah nama panggilanmu di sini untuk digunakan dalam ruang chat.
        </p>
      </div>

      <Card className="flex flex-col items-center gap-4">
        <div className="relative">
          <AvatarIcon seed={profile.avatarSeed} />
          <button
            type="button"
            onClick={handleCycleAvatar}
            disabled={cycling}
            aria-label="Ganti Avatar"
            className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm disabled:opacity-50"
          >
            🔄
          </button>
        </div>
        <span className="rounded-full bg-surface-container-highest px-3 py-1 text-label-sm text-on-surface-variant">
          Avatar acak
        </span>
      </Card>

      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-label-sm uppercase text-on-surface-variant">Nama Panggilan (Anonim)</p>
          <span aria-hidden="true">🛡️</span>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <input
              value={draftNickname}
              onChange={(e) => setDraftNickname(e.target.value)}
              placeholder="mis. Sahabat Langit"
              className="flex-1 rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
            />
            <Button onClick={handleSaveNickname} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <h2 className="text-headline-md text-on-surface">{displayName}</h2>
            <button
              type="button"
              onClick={() => {
                setDraftNickname(profile.nickname ?? "");
                setEditing(true);
              }}
              aria-label="Edit nama"
              className="text-primary"
            >
              ✏️
            </button>
          </div>
        )}
      </Card>

      <div className="flex items-start gap-3 rounded-lg bg-secondary-fixed/30 p-4">
        <span aria-hidden="true">🔒</span>
        <div>
          <h3 className="text-label-md font-semibold text-on-surface">Zona Aman &amp; Rahasia</h3>
          <p className="text-body-md text-on-surface-variant">
            Kami tidak menyimpan data pribadi Anda di profil ini. Konselor atau teman sebaya hanya akan melihat
            avatar dan nama panggilan di atas.
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
        🗑 Hapus Akun Anonim
      </Button>

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Hapus akun anonim?"
        description="Semua riwayat percakapanmu akan dihapus permanen dan tidak bisa dikembalikan."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Batal
            </Button>
            <Button onClick={handleDelete} disabled={deleting}>
              {deleting ? "Menghapus..." : "Hapus"}
            </Button>
          </>
        }
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

Create `src/app/student/(shell)/profil/page.tsx`:

```tsx
import { ProfilScreen } from "@/components/student/ProfilScreen";

export default function ProfilPage() {
  return <ProfilScreen />;
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. Navigate to `/student/profil`. Confirm the avatar, display name, and "Zona Aman & Rahasia" card render. Click the 🔄 button and confirm the avatar changes and persists across a page reload. Click ✏️, change the nickname, save, and confirm it updates (and that the "Ruang Chat" session cards elsewhere still show the *kader's* name, not this — the student's own nickname only appears here). Click "Hapus Akun Anonim", confirm the modal, click "Hapus", and confirm you're redirected to `/` and that revisiting `/student/cerita-saya` now treats you as a brand-new student (no identity).

- [ ] **Step 5: Commit**

```bash
git add src/components/student/ProfilScreen.tsx "src/app/student/(shell)/profil/page.tsx"
git commit -m "feat(student): add Profil Anonim screen and route"
```

---

### Task 13: ReportModal component + Modal.tsx width fix + wire into ChatScreen

**Files:**
- Create: `src/components/student/ReportModal.tsx`
- Modify: `src/components/ui/Modal.tsx`
- Modify: `src/components/student/ChatScreen.tsx`

**Interfaces:**
- Consumes: `submitSessionReport` (Task 7) from `@/lib/student/actions`; `REPORT_REASON_LABELS`, `ReportReason` from `@/lib/student/types`; `Button`, `Modal` from `@/components/ui/*`.
- Produces: `ReportModal({ open, onClose, sessionId, studentLocalId })`. Wired into `ChatScreen.tsx`'s header via a new flag icon (the spec's Phase-1 note that this icon was "present but inert" didn't match reality — no such icon existed in the code at all, so this task adds it fresh).

- [ ] **Step 1: Fix Modal's width token collision**

In `src/components/ui/Modal.tsx`, this project's custom `--spacing-sm: 16px` design token collides with Tailwind's built-in `sm` breakpoint key that `max-w-sm` resolves against, shrinking it well below Tailwind's intended 24rem. `src/components/auth/LoginCard.tsx` and `src/app/student/page.tsx` already work around this with the literal `max-w-[24rem]`. Apply the same fix here: replace

```tsx
className="relative w-full max-w-sm rounded-xl bg-surface-container-lowest p-md shadow-xl"
```

with

```tsx
className="relative w-full max-w-[24rem] rounded-xl bg-surface-container-lowest p-md shadow-xl"
```

- [ ] **Step 2: Implement the report modal**

Create `src/components/student/ReportModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { submitSessionReport } from "@/lib/student/actions";
import { REPORT_REASON_LABELS } from "@/lib/student/types";
import type { ReportReason } from "@/lib/student/types";

const REASONS: ReportReason[] = ["uncomfortable", "unresponsive", "need_teacher", "other"];

export function ReportModal({
  open,
  onClose,
  sessionId,
  studentLocalId,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  studentLocalId: string;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleClose() {
    setReason(null);
    setDetails("");
    setError(null);
    setSubmitted(false);
    onClose();
  }

  async function handleSubmit() {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitSessionReport({
        sessionId,
        studentLocalId,
        reason,
        details: reason === "other" ? details : undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim laporan");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Modal open={open} onClose={handleClose} title="Laporan Terkirim">
        <p className="text-body-lg text-on-surface-variant">
          Terima kasih sudah memberi tahu kami. Laporanmu akan ditinjau oleh pihak sekolah.
        </p>
        <Button className="mt-6 w-full" variant="ghost" onClick={handleClose}>
          Tutup
        </Button>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Laporkan Sesi"
      description="Laporanmu akan ditinjau oleh pihak sekolah secara rahasia."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={!reason || submitting}>
            {submitting ? "Mengirim..." : "Kirim Laporan"}
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label-md font-semibold text-on-surface">
          Pilih alasan laporan (wajib)
        </legend>
        {REASONS.map((value) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
              reason === value ? "border-primary bg-secondary-container/40" : "border-outline-variant",
            )}
          >
            <input
              type="radio"
              name="reason"
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
              className="h-4 w-4"
            />
            <span className="text-body-md text-on-surface">{REPORT_REASON_LABELS[value]}</span>
          </label>
        ))}
      </fieldset>

      {reason === "other" && (
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Ceritakan lebih lanjut (opsional)"
          rows={3}
          className="mt-3 w-full resize-none rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
        />
      )}

      {error && (
        <p className="mt-3 rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}
    </Modal>
  );
}
```

- [ ] **Step 3: Wire the flag icon into `ChatScreen.tsx`**

In `src/components/student/ChatScreen.tsx`, add the import:

```tsx
import { ReportModal } from "./ReportModal";
```

In the `ChatSession` component, add state alongside the existing `draft`/`ending`/`sendError`/`kaderInfo` state:

```tsx
const [reportOpen, setReportOpen] = useState(false);
```

Replace the header's right-hand side — currently just the "Selesaikan Sesi" button on its own:

```tsx
<Button variant="ghost" onClick={handleEnd} disabled={ending}>
  {ending ? "Mengakhiri..." : "Selesaikan Sesi"}
</Button>
```

with a flag icon alongside it:

```tsx
<div className="flex items-center gap-2">
  <button
    type="button"
    onClick={() => setReportOpen(true)}
    aria-label="Laporkan Sesi"
    className="text-on-surface-variant hover:text-error"
  >
    🚩
  </button>
  <Button variant="ghost" onClick={handleEnd} disabled={ending}>
    {ending ? "Mengakhiri..." : "Selesaikan Sesi"}
  </Button>
</div>
```

Then render the modal itself right before the `ChatSession` component's closing `</main>`:

```tsx
<ReportModal
  open={reportOpen}
  onClose={() => setReportOpen(false)}
  sessionId={sessionId}
  studentLocalId={studentLocalId}
/>
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual check**

Run: `npm run dev`, open a chat session as a student, click the 🚩 icon, confirm the modal opens at a comfortable width (not the old, too-narrow `max-w-sm`), select "Lainnya" and confirm a details textarea appears (and disappears again if you switch to another reason), submit, and confirm the "Laporan Terkirim" success view appears. Close it and confirm the underlying chat screen is unaffected. Reopen the modal and confirm it starts fresh (no leftover selection from the previous submission).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/Modal.tsx src/components/student/ReportModal.tsx src/components/student/ChatScreen.tsx
git commit -m "feat(student): add Laporkan Sesi report modal, fix Modal width, wire into ChatScreen"
```

---

### Task 14: Redirect swaps — point Phase 1's fallbacks at Cerita Saya

**Files:**
- Modify: `src/app/student/page.tsx`
- Modify: `src/components/student/ChatScreen.tsx`

**Interfaces:** None — this only changes two redirect targets now that `/student/cerita-saya` exists (Task 11).

- [ ] **Step 1: Update the welcome page's existing-identity redirect**

In `src/app/student/page.tsx`, replace:

```tsx
    if (existing) {
      // TODO(Phase 2): once /student/cerita-saya exists, redirect there instead.
      router.replace("/student/topik");
      return;
    }
```

with:

```tsx
    if (existing) {
      router.replace("/student/cerita-saya");
      return;
    }
```

- [ ] **Step 2: Update `ChatScreen.tsx`'s end-session redirect**

In `src/components/student/ChatScreen.tsx`'s `handleEnd` function, replace:

```tsx
      await endSession({ sessionId, studentLocalId });
      // TODO(Phase 2): once /student/cerita-saya exists, redirect there instead.
      router.push("/student/topik");
```

with:

```tsx
      await endSession({ sessionId, studentLocalId });
      router.push("/student/cerita-saya");
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. With an existing student identity, visit `/student` and confirm it now redirects to `/student/cerita-saya` (not `/student/topik`). Start a session, click "Selesaikan Sesi", and confirm it redirects to `/student/cerita-saya` and the now-ended session appears there with a "Selesai" status.

- [ ] **Step 5: Commit**

```bash
git add src/app/student/page.tsx src/components/student/ChatScreen.tsx
git commit -m "feat(student): point Phase 1 redirect fallbacks at Cerita Saya"
```

---

### Task 15: Full regression pass and manual walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: PASS — `tests/schema.test.ts`, `tests/chat.test.ts`, `tests/kader-actions.test.ts`, `tests/guru-actions.test.ts`, `tests/student-types.test.ts`, `tests/student-avatars.test.ts`, `tests/student-actions.test.ts` all green. If a run shows spurious failures unrelated to this plan's files (e.g. transient Supabase auth rate-limiting under concurrent load — a known characteristic of this shared test project, not something this plan introduces), re-run once before treating it as a real regression.

- [ ] **Step 2: Type-check and lint the whole project**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual end-to-end walkthrough**

Run: `npm run dev`. As a student:
1. Visit `/student` fresh (no local identity) — confirm the welcome card, enter an optional nickname, click "Mulai Secara Anonim", confirm it routes to `/student/topik`.
2. Complete the wizard (pick a topic, pick an available kader, confirm) through to a live chat session.
3. In the chat, click 🚩, submit a report, confirm the success view, close it.
4. Click "Selesaikan Sesi" — confirm it redirects to `/student/cerita-saya` and the session shows there with a "Selesai" status, the right kader name, and topic.
5. Click "+ Cerita Baru" from Cerita Saya, confirm it starts a fresh wizard flow.
6. Reload `/student` directly — confirm it now redirects straight to `/student/cerita-saya` (not the wizard), since a local identity already exists.
7. Go to `/student/profil`. Cycle the avatar a few times, confirm it changes and survives a reload. Edit the nickname, save, confirm the display name updates.
8. Click "Hapus Akun Anonim", confirm the modal, confirm deletion redirects to `/` and clears the local identity — visiting `/student` again now shows the welcome screen as a brand-new student.

- [ ] **Step 4: Confirm no unrelated regressions**

Log in as a kader and as a guru (existing flows) and confirm both still work — this plan only touched `src/lib/student/`, `src/components/student/`, `src/app/student/`, `src/components/ui/Modal.tsx`, `src/lib/kader/types.ts`, and `src/lib/guru/types.ts` (the last two only via the Task 1 label relocation, which is a pure re-export with no behavior change).
