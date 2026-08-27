# Kader Portal Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the kader portal's placeholder dashboard with a real Beranda (status toggle + active-consultation list) and a working Ruang Chat screen, so a logged-in kader can reply to and end their assigned sessions end-to-end.

**Architecture:** New `src/lib/kader/` module split into `core.ts` (RLS-scoped query functions that take a `SupabaseClient` — testable directly against a signed-in test user, mirroring the existing `src/lib/chat/core.ts` pattern) and `actions.ts` (`"use server"` thin wrappers that resolve the cookie-based authenticated client and delegate to `core.ts`). New `src/components/kader/` module for the dashboard and chat UI, reusing the existing `Button`/`Card`/`Chip`/`ChatBubble`/`Modal` primitives and the shared `useSessionChat` realtime transport unmodified.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS + Realtime Broadcast), TypeScript, Tailwind v4, Vitest for integration tests against a real Supabase project (no schema changes in this plan).

**Spec:** `docs/superpowers/specs/2026-08-27-kader-portal-design.md`

## Global Constraints

- No schema/migration changes — every table, column, and RLS policy this plan uses already exists in `supabase/schema.sql`.
- All new kader-side reads/writes use the **authenticated** Supabase client (`createClient()` from `@/lib/supabase/server`) so RLS enforces authorization — never `createServiceClient()` for `profiles`/`sessions`/`messages`, mirroring how `src/lib/chat/actions.ts` already treats the kader actor. The one exception is looking up `student_identities` (no `authenticated` grant exists on that table at all), which always goes through the service client and only after an RLS-scoped query has already proven the current kader owns that session.
- Every query-bearing function in `src/lib/kader/` is split into a `..Core(supabase, ...)` function in `core.ts` (takes an explicit `SupabaseClient`, no `"use server"`, unit-testable) and a same-named wrapper in `actions.ts` (`"use server"`, resolves `createClient()`, delegates to core) — do not put query logic directly in `actions.ts`.
- Reuse existing domain types/constants from `@/lib/student/types.ts` (`Topic`, `TOPIC_LABELS`, `TOPIC_EMOJI`, `KaderStatus`) — do not redefine them under `src/lib/kader/`.
- All user-facing copy and thrown error messages are Bahasa Indonesia, matching the rest of the app.
- The chat header's "Alihkan" and "Hubungi Guru/BK" buttons are rendered but `disabled` in this plan — Phase 2 wires them up. Do not add a "Menunggu" queue section to Beranda and do not add a "Ruang Chat" nav item — both are explicitly out of scope per spec §6.

---

### Task 1: Shared student display-name helper

**Files:**
- Modify: `src/lib/student/types.ts`
- Modify: `src/lib/student/actions.ts:6-9`
- Test: `tests/student-types.test.ts` (new)

**Interfaces:**
- Produces: `AVATAR_SEED_LABELS: Record<string, string>` and `getStudentDisplayName(nickname: string | null | undefined, avatarSeed: string | null | undefined): string`, both exported from `@/lib/student/types`. Later tasks import `getStudentDisplayName` from there.

- [ ] **Step 1: Write the failing test**

Create `tests/student-types.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getStudentDisplayName, AVATAR_SEED_LABELS } from "@/lib/student/types";

describe("getStudentDisplayName", () => {
  it("uses the nickname when one is set", () => {
    expect(getStudentDisplayName("Sahabat Langit", "kucing")).toBe("Sahabat Langit");
  });

  it("trims whitespace-only nicknames and falls back", () => {
    expect(getStudentDisplayName("   ", "kucing")).toBe("Anonim_Kucing");
  });

  it("falls back to Anonim_<AvatarLabel> when there is no nickname", () => {
    expect(getStudentDisplayName(null, "rubah")).toBe("Anonim_Rubah");
    expect(getStudentDisplayName(undefined, "panda")).toBe("Anonim_Panda");
  });

  it("falls back to a generic label when avatarSeed is missing or unknown", () => {
    expect(getStudentDisplayName(null, null)).toBe("Anonim_Siswa");
    expect(getStudentDisplayName(undefined, "unknown-seed")).toBe("Anonim_Siswa");
  });

  it("has a label for every seed used by randomAvatarSeed", () => {
    expect(Object.keys(AVATAR_SEED_LABELS).length).toBeGreaterThan(0);
    for (const key of Object.keys(AVATAR_SEED_LABELS)) {
      expect(typeof AVATAR_SEED_LABELS[key]).toBe("string");
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/student-types.test.ts`
Expected: FAIL — `getStudentDisplayName` and `AVATAR_SEED_LABELS` are not exported from `@/lib/student/types`.

- [ ] **Step 3: Implement**

Append to `src/lib/student/types.ts`:

```typescript
export const AVATAR_SEED_LABELS: Record<string, string> = {
  kucing: "Kucing",
  kelinci: "Kelinci",
  rubah: "Rubah",
  beruang: "Beruang",
  burung: "Burung",
  rusa: "Rusa",
  panda: "Panda",
  koala: "Koala",
};

export function getStudentDisplayName(
  nickname: string | null | undefined,
  avatarSeed: string | null | undefined,
): string {
  const trimmed = nickname?.trim();
  if (trimmed) return trimmed;
  const label = avatarSeed ? AVATAR_SEED_LABELS[avatarSeed] : undefined;
  return `Anonim_${label ?? "Siswa"}`;
}
```

Then in `src/lib/student/actions.ts`, replace lines 6-9:

```typescript
const AVATAR_SEEDS = ["kucing", "kelinci", "rubah", "beruang", "burung", "rusa", "panda", "koala"];

function randomAvatarSeed(): string {
  return AVATAR_SEEDS[Math.floor(Math.random() * AVATAR_SEEDS.length)];
}
```

with:

```typescript
import { AVATAR_SEED_LABELS } from "./types";

function randomAvatarSeed(): string {
  const seeds = Object.keys(AVATAR_SEED_LABELS);
  return seeds[Math.floor(Math.random() * seeds.length)];
}
```

(Add the `import { AVATAR_SEED_LABELS } from "./types";` line near the top of the file, alongside the existing `import type { Topic, KaderSummary, KaderStatus } from "./types";` — merge into one import statement from `"./types"`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/student-types.test.ts tests/student-actions.test.ts`
Expected: PASS (all tests, including the pre-existing `createStudentIdentity` tests which assert `avatar_seed` is truthy).

- [ ] **Step 5: Commit**

```bash
git add src/lib/student/types.ts src/lib/student/actions.ts tests/student-types.test.ts
git commit -m "feat(kader): add shared student display-name fallback helper"
```

---

### Task 2: Kader dashboard — core query, action, and test helper

**Files:**
- Create: `src/lib/kader/types.ts`
- Create: `src/lib/kader/core.ts`
- Create: `src/lib/kader/actions.ts`
- Modify: `tests/helpers.ts`
- Test: `tests/kader-actions.test.ts` (new)

**Interfaces:**
- Consumes: `getStudentDisplayName` (Task 1) from `@/lib/student/types`; `KaderStatus`, `Topic` from `@/lib/student/types`; `createClient` from `@/lib/supabase/server`; `createServiceClient` from `@/lib/supabase/service`; `createTestUser`, `deleteTestUser`, `createTestStudentIdentity`, `deleteTestStudentIdentity`, `createTestSession`, `deleteTestSession`, `signInTestUser`, `getServiceClient` from `./helpers`.
- Produces: `KaderDashboardSession`, `KaderDashboard` types from `@/lib/kader/types`; `getKaderDashboardCore(supabase: SupabaseClient): Promise<KaderDashboard>` from `@/lib/kader/core`; `getKaderDashboard(): Promise<KaderDashboard>` from `@/lib/kader/actions`; `createSignedInTestKader(opts?: { verified?: boolean; status?: KaderStatus }): Promise<{ id: string; client: SupabaseClient }>` from `./helpers` (used by this and every later kader test task).

- [ ] **Step 1: Add the signed-in-kader test helper**

Add to `tests/helpers.ts` (near `signInTestUser`):

```typescript
export async function createSignedInTestKader(
  opts: { verified?: boolean; status?: string } = {},
): Promise<{ id: string; client: SupabaseClient }> {
  const user = await createTestUser("kader", { verified: opts.verified ?? true });
  if (opts.status) {
    const service = getServiceClient();
    await service.from("profiles").update({ status: opts.status }).eq("id", user.id);
  }
  const { client } = await signInTestUser(user.email, user.password);
  return { id: user.id, client };
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/kader-actions.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getKaderDashboardCore } from "@/lib/kader/core";
import {
  getServiceClient,
  createSignedInTestKader,
  deleteTestUser,
  createTestStudentIdentity,
  deleteTestStudentIdentity,
  createTestSession,
  deleteTestSession,
} from "./helpers";

describe("getKaderDashboardCore", () => {
  it("returns the kader's own name/status and an empty list with no sessions", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    try {
      const result = await getKaderDashboardCore(client);
      expect(result.status).toBe("available");
      expect(result.fullName).toBeTruthy();
      expect(result.activeSessions).toEqual([]);
    } finally {
      await deleteTestUser(id);
    }
  });

  it("lists only this kader's active sessions, with topic, preview, and a nickname-based display name", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: "Sahabat Langit" }).eq("id", localId);

      const sessionId = await createTestSession({
        studentLocalId: localId,
        assignedTo: id,
        topics: ["bullying"],
      });
      cleanup.push(() => deleteTestSession(sessionId));
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);
      await service
        .from("messages")
        .insert({ session_id: sessionId, sender_role: "student", body: "Halo kak" });

      const result = await getKaderDashboardCore(client);
      expect(result.activeSessions).toHaveLength(1);
      const session = result.activeSessions[0];
      expect(session.id).toBe(sessionId);
      expect(session.topics).toEqual(["bullying"]);
      expect(session.studentDisplayName).toBe("Sahabat Langit");
      expect(session.lastMessagePreview).toBe("Halo kak");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("falls back to an avatar-based display name when the student has no nickname", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const service = getServiceClient();
      await service
        .from("student_identities")
        .update({ nickname: null, avatar_seed: "panda" })
        .eq("id", localId);

      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      const result = await getKaderDashboardCore(client);
      expect(result.activeSessions[0].studentDisplayName).toBe("Anonim_Panda");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("excludes sessions assigned to a different kader and non-active sessions", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const other = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      const otherSessionId = await createTestSession({ studentLocalId: localId, assignedTo: other.id });
      cleanup.push(() => deleteTestSession(otherSessionId));
      const service = getServiceClient();
      await service.from("sessions").update({ status: "active" }).eq("id", otherSessionId);

      const endedSessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(endedSessionId));
      await service.from("sessions").update({ status: "ended" }).eq("id", endedSessionId);

      const result = await getKaderDashboardCore(client);
      expect(result.activeSessions).toEqual([]);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(other.id);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/kader-actions.test.ts`
Expected: FAIL — `@/lib/kader/core` does not exist yet.

- [ ] **Step 4: Implement the types**

Create `src/lib/kader/types.ts`:

```typescript
import type { KaderStatus, Topic } from "@/lib/student/types";

export type KaderDashboardSession = {
  id: string;
  topics: Topic[];
  studentDisplayName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

export type KaderDashboard = {
  fullName: string;
  status: KaderStatus;
  activeSessions: KaderDashboardSession[];
};
```

- [ ] **Step 5: Implement the core function**

Create `src/lib/kader/core.ts`:

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getStudentDisplayName } from "@/lib/student/types";
import type { Topic } from "@/lib/student/types";
import type { KaderDashboard, KaderDashboardSession } from "./types";

export async function getKaderDashboardCore(supabase: SupabaseClient): Promise<KaderDashboard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("Gagal memuat profil");
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, topics, student_local_id, last_message_at")
    .eq("assigned_to", user.id)
    .eq("status", "active")
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (sessionsError) {
    throw new Error("Gagal memuat daftar konsultasi");
  }

  const sessionRows = sessions ?? [];
  const studentLocalIds = sessionRows.map((row) => row.student_local_id as string);

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

  const latestMessageBySession = new Map<string, { body: string; created_at: string }>();
  const sessionIds = sessionRows.map((row) => row.id as string);
  if (sessionIds.length > 0) {
    const { data: messages } = await supabase
      .from("messages")
      .select("session_id, body, created_at")
      .in("session_id", sessionIds)
      .order("created_at", { ascending: false });
    for (const message of messages ?? []) {
      const sessionId = message.session_id as string;
      if (!latestMessageBySession.has(sessionId)) {
        latestMessageBySession.set(sessionId, {
          body: message.body as string,
          created_at: message.created_at as string,
        });
      }
    }
  }

  const activeSessions: KaderDashboardSession[] = sessionRows.map((row) => {
    const identity = identityById.get(row.student_local_id as string);
    const latest = latestMessageBySession.get(row.id as string);
    return {
      id: row.id as string,
      topics: (row.topics as Topic[]) ?? [],
      studentDisplayName: getStudentDisplayName(identity?.nickname, identity?.avatar_seed),
      lastMessagePreview: latest?.body ?? null,
      lastMessageAt: (row.last_message_at as string | null) ?? latest?.created_at ?? null,
    };
  });

  return {
    fullName: (profile.full_name as string | null) ?? "Kader",
    status: profile.status as KaderDashboard["status"],
    activeSessions,
  };
}
```

- [ ] **Step 6: Implement the action wrapper**

Create `src/lib/kader/actions.ts`:

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { getKaderDashboardCore } from "./core";
import type { KaderDashboard } from "./types";

export async function getKaderDashboard(): Promise<KaderDashboard> {
  const supabase = await createClient();
  return getKaderDashboardCore(supabase);
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/kader-actions.test.ts`
Expected: PASS (all 4 tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/kader/types.ts src/lib/kader/core.ts src/lib/kader/actions.ts tests/helpers.ts tests/kader-actions.test.ts
git commit -m "feat(kader): add kader dashboard query (status, active sessions, previews)"
```

---

### Task 3: Update kader status — core, action, and test

**Files:**
- Modify: `src/lib/kader/core.ts`
- Modify: `src/lib/kader/actions.ts`
- Modify: `tests/kader-actions.test.ts`

**Interfaces:**
- Consumes: `createSignedInTestKader`, `deleteTestUser` (Task 2) from `./helpers`; `getServiceClient` from `./helpers`.
- Produces: `updateKaderStatusCore(supabase: SupabaseClient, status: KaderStatus): Promise<void>` from `@/lib/kader/core`; `updateKaderStatus(status: KaderStatus): Promise<void>` from `@/lib/kader/actions`.

- [ ] **Step 1: Write the failing test**

Add to `tests/kader-actions.test.ts`:

```typescript
import { updateKaderStatusCore } from "@/lib/kader/core";

describe("updateKaderStatusCore", () => {
  it("updates the signed-in kader's own status", async () => {
    const { id, client } = await createSignedInTestKader({ status: "offline" });
    try {
      await updateKaderStatusCore(client, "available");
      const service = getServiceClient();
      const { data } = await service.from("profiles").select("status").eq("id", id).single();
      expect(data?.status).toBe("available");
    } finally {
      await deleteTestUser(id);
    }
  });
});
```

(Add this `import` line alongside the existing `getKaderDashboardCore` import at the top of the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/kader-actions.test.ts -t updateKaderStatusCore`
Expected: FAIL — `updateKaderStatusCore` is not exported from `@/lib/kader/core`.

- [ ] **Step 3: Implement**

Append to `src/lib/kader/core.ts`:

```typescript
import type { KaderStatus } from "@/lib/student/types";

export async function updateKaderStatusCore(
  supabase: SupabaseClient,
  status: KaderStatus,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { error } = await supabase.from("profiles").update({ status }).eq("id", user.id);

  if (error) {
    throw new Error("Gagal memperbarui status");
  }
}
```

(Merge the `import type { KaderStatus } from "@/lib/student/types";` into the existing `import type { Topic } from "@/lib/student/types";` line at the top of `core.ts` as `import type { KaderStatus, Topic } from "@/lib/student/types";`.)

Append to `src/lib/kader/actions.ts`:

```typescript
import { revalidatePath } from "next/cache";
import { getKaderDashboardCore, updateKaderStatusCore } from "./core";
import type { KaderStatus } from "@/lib/student/types";

export async function updateKaderStatus(status: KaderStatus): Promise<void> {
  const supabase = await createClient();
  await updateKaderStatusCore(supabase, status);
  revalidatePath("/kader");
  revalidatePath("/kader/profil");
}
```

(Merge the `getKaderDashboardCore, updateKaderStatusCore` import into the existing `import { getKaderDashboardCore } from "./core";` line, and add the `revalidatePath`/`KaderStatus` imports near the top alongside the existing ones.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/kader-actions.test.ts`
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kader/core.ts src/lib/kader/actions.ts tests/kader-actions.test.ts
git commit -m "feat(kader): add updateKaderStatus server action"
```

---

### Task 4: End kader session — core, action, and test

**Files:**
- Modify: `src/lib/kader/core.ts`
- Modify: `src/lib/kader/actions.ts`
- Modify: `tests/kader-actions.test.ts`

**Interfaces:**
- Consumes: `createSignedInTestKader`, `createTestStudentIdentity`, `deleteTestStudentIdentity`, `createTestSession`, `deleteTestSession`, `deleteTestUser`, `getServiceClient` from `./helpers`.
- Produces: `endKaderSessionCore(supabase: SupabaseClient, sessionId: string): Promise<void>` from `@/lib/kader/core`; `endKaderSession(input: { sessionId: string }): Promise<void>` from `@/lib/kader/actions`.

- [ ] **Step 1: Write the failing test**

Add to `tests/kader-actions.test.ts`:

```typescript
import { endKaderSessionCore } from "@/lib/kader/core";

describe("endKaderSessionCore", () => {
  it("marks a session ended when called by its assigned kader", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));

      await endKaderSessionCore(client, sessionId);

      const service = getServiceClient();
      const { data } = await service.from("sessions").select("status, ended_at").eq("id", sessionId).single();
      expect(data?.status).toBe("ended");
      expect(data?.ended_at).toBeTruthy();
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("rejects ending a session assigned to a different kader", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const owner = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: owner.id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(endKaderSessionCore(client, sessionId)).rejects.toThrow("Gagal mengakhiri sesi");

      const service = getServiceClient();
      const { data } = await service.from("sessions").select("status").eq("id", sessionId).single();
      expect(data?.status).not.toBe("ended");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(owner.id);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/kader-actions.test.ts -t endKaderSessionCore`
Expected: FAIL — `endKaderSessionCore` is not exported from `@/lib/kader/core`.

- [ ] **Step 3: Implement**

Append to `src/lib/kader/core.ts`:

```typescript
export async function endKaderSessionCore(supabase: SupabaseClient, sessionId: string): Promise<void> {
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

Append to `src/lib/kader/actions.ts`:

```typescript
export async function endKaderSession(input: { sessionId: string }): Promise<void> {
  const supabase = await createClient();
  await endKaderSessionCore(supabase, input.sessionId);
  revalidatePath("/kader");
}
```

(Merge `endKaderSessionCore` into the existing `import { getKaderDashboardCore, updateKaderStatusCore } from "./core";` line.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/kader-actions.test.ts`
Expected: PASS (all tests so far).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kader/core.ts src/lib/kader/actions.ts tests/kader-actions.test.ts
git commit -m "feat(kader): add endKaderSession server action"
```

---

### Task 5: Session student info (chat header) — core, action, and test

**Files:**
- Modify: `src/lib/kader/types.ts`
- Modify: `src/lib/kader/core.ts`
- Modify: `src/lib/kader/actions.ts`
- Modify: `tests/kader-actions.test.ts`

**Interfaces:**
- Consumes: `getStudentDisplayName` (Task 1); `createSignedInTestKader`, `createTestStudentIdentity`, `deleteTestStudentIdentity`, `createTestSession`, `deleteTestSession`, `deleteTestUser`, `getServiceClient` from `./helpers`.
- Produces: `SessionStatus` and `SessionStudentInfo` types from `@/lib/kader/types`; `getSessionStudentInfoCore(supabase: SupabaseClient, sessionId: string): Promise<SessionStudentInfo>` from `@/lib/kader/core`; `getSessionStudentInfo(input: { sessionId: string }): Promise<SessionStudentInfo>` from `@/lib/kader/actions`. Task 9 (kader chat screen) consumes the action.

- [ ] **Step 1: Write the failing test**

Add to `tests/kader-actions.test.ts`:

```typescript
import { getSessionStudentInfoCore } from "@/lib/kader/core";

describe("getSessionStudentInfoCore", () => {
  it("returns topics, status, and the student's display name for the assigned kader", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const service = getServiceClient();
      await service.from("student_identities").update({ nickname: "Sahabat Langit" }).eq("id", localId);

      const sessionId = await createTestSession({
        studentLocalId: localId,
        assignedTo: id,
        topics: ["keluarga"],
      });
      cleanup.push(() => deleteTestSession(sessionId));
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      const info = await getSessionStudentInfoCore(client, sessionId);
      expect(info.displayName).toBe("Sahabat Langit");
      expect(info.topics).toEqual(["keluarga"]);
      expect(info.status).toBe("active");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("rejects a kader who is not assigned to the session", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const owner = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: owner.id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(getSessionStudentInfoCore(client, sessionId)).rejects.toThrow("Sesi tidak ditemukan");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(owner.id);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/kader-actions.test.ts -t getSessionStudentInfoCore`
Expected: FAIL — `getSessionStudentInfoCore` is not exported from `@/lib/kader/core`.

- [ ] **Step 3: Add the types**

Append to `src/lib/kader/types.ts`:

```typescript
export type SessionStatus = "waiting" | "active" | "escalated" | "ended";

export type SessionStudentInfo = {
  displayName: string;
  topics: Topic[];
  status: SessionStatus;
};
```

- [ ] **Step 4: Implement the core function**

Append to `src/lib/kader/core.ts`:

```typescript
import type { SessionStatus, SessionStudentInfo } from "./types";

export async function getSessionStudentInfoCore(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SessionStudentInfo> {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("topics, status, student_local_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error("Sesi tidak ditemukan");
  }

  const service = createServiceClient();
  const { data: identity } = await service
    .from("student_identities")
    .select("nickname, avatar_seed")
    .eq("id", session.student_local_id as string)
    .single();

  return {
    displayName: getStudentDisplayName(
      identity?.nickname as string | null | undefined,
      identity?.avatar_seed as string | null | undefined,
    ),
    topics: (session.topics as Topic[]) ?? [],
    status: session.status as SessionStatus,
  };
}
```

(Merge the `import type { SessionStatus, SessionStudentInfo } from "./types";` into the existing `import type { KaderDashboard, KaderDashboardSession } from "./types";` line, making it `import type { KaderDashboard, KaderDashboardSession, SessionStatus, SessionStudentInfo } from "./types";`.)

- [ ] **Step 5: Implement the action wrapper**

Append to `src/lib/kader/actions.ts`:

```typescript
import { getSessionStudentInfoCore } from "./core";
import type { SessionStudentInfo } from "./types";

export async function getSessionStudentInfo(input: { sessionId: string }): Promise<SessionStudentInfo> {
  const supabase = await createClient();
  return getSessionStudentInfoCore(supabase, input.sessionId);
}
```

(Merge into the existing `core`-import and add-type-import lines rather than duplicating them.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/kader-actions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in `tests/chat.test.ts`, `tests/student-actions.test.ts`, `tests/schema.test.ts`, `tests/student-types.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/kader/types.ts src/lib/kader/core.ts src/lib/kader/actions.ts tests/kader-actions.test.ts
git commit -m "feat(kader): add getSessionStudentInfo for the chat header"
```

---

### Task 6: StatusToggle component

**Files:**
- Create: `src/components/kader/StatusToggle.tsx`

**Interfaces:**
- Consumes: `updateKaderStatus` (Task 3) from `@/lib/kader/actions`; `KaderStatus` from `@/lib/student/types`; `cn` from `@/lib/cn`.
- Produces: `StatusToggle({ status: KaderStatus })` — a client component with its own optimistic local state. Consumed by Task 8 (Beranda) and Task 10 (Profil).

- [ ] **Step 1: Implement**

Create `src/components/kader/StatusToggle.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { updateKaderStatus } from "@/lib/kader/actions";
import type { KaderStatus } from "@/lib/student/types";

const STATUS_OPTIONS: { value: KaderStatus; label: string }[] = [
  { value: "available", label: "Tersedia" },
  { value: "busy", label: "Sibuk" },
  { value: "offline", label: "Offline" },
];

export function StatusToggle({ status }: { status: KaderStatus }) {
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSelect(next: KaderStatus) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateKaderStatus(next);
      } catch (err) {
        setCurrent(previous);
        setError(err instanceof Error ? err.message : "Gagal memperbarui status");
      }
    });
  }

  return (
    <div>
      <div className="inline-flex rounded-full border border-outline-variant bg-surface-container-low p-1">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={pending}
            onClick={() => handleSelect(option.value)}
            className={cn(
              "rounded-full px-4 py-2 text-label-md font-semibold transition-colors disabled:opacity-50",
              current === option.value
                ? "bg-primary text-on-primary shadow-sm"
                : "text-on-surface-variant hover:bg-surface-variant",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-label-sm text-error">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors from `src/components/kader/StatusToggle.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/kader/StatusToggle.tsx
git commit -m "feat(kader): add StatusToggle component"
```

---

### Task 7: SessionCard component

**Files:**
- Create: `src/components/kader/SessionCard.tsx`

**Interfaces:**
- Consumes: `KaderDashboardSession` (Task 2) from `@/lib/kader/types`; `Card`, `Chip` from `@/components/ui/*`; `TOPIC_LABELS`, `TOPIC_EMOJI` from `@/lib/student/types`.
- Produces: `SessionCard({ session: KaderDashboardSession })`. Consumed by Task 8 (Beranda).

- [ ] **Step 1: Implement**

Create `src/components/kader/SessionCard.tsx`:

```tsx
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { TOPIC_EMOJI, TOPIC_LABELS } from "@/lib/student/types";
import type { KaderDashboardSession } from "@/lib/kader/types";

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function SessionCard({ session }: { session: KaderDashboardSession }) {
  const initial = session.studentDisplayName.trim().charAt(0).toUpperCase() || "A";
  const primaryTopic = session.topics[0];

  return (
    <Link href={`/kader/chat/${session.id}`}>
      <Card className="flex flex-col gap-2 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-fixed text-label-md font-bold text-on-secondary-fixed"
            >
              {initial}
            </div>
            <div>
              <p className="text-label-md font-semibold text-on-surface">{session.studentDisplayName}</p>
              {primaryTopic && (
                <Chip tone="secondary" className="mt-1">
                  {TOPIC_EMOJI[primaryTopic]} {TOPIC_LABELS[primaryTopic]}
                </Chip>
              )}
            </div>
          </div>
          <span className="whitespace-nowrap text-label-sm text-on-surface-variant">
            {formatTime(session.lastMessageAt)}
          </span>
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
Expected: no new errors from `src/components/kader/SessionCard.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/kader/SessionCard.tsx
git commit -m "feat(kader): add SessionCard component"
```

---

### Task 8: DashboardScreen — wire Beranda together

**Files:**
- Create: `src/components/kader/DashboardScreen.tsx`
- Modify: `src/app/kader/(protected)/page.tsx`

**Interfaces:**
- Consumes: `getKaderDashboard` (Task 2) from `@/lib/kader/actions`; `KaderDashboard` from `@/lib/kader/types`; `StatusToggle` (Task 6); `SessionCard` (Task 7).
- Produces: `DashboardScreen()` — self-fetching client component, default export target for the rewritten `/kader` page.

- [ ] **Step 1: Implement the screen**

Create `src/components/kader/DashboardScreen.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { getKaderDashboard } from "@/lib/kader/actions";
import type { KaderDashboard } from "@/lib/kader/types";
import { StatusToggle } from "./StatusToggle";
import { SessionCard } from "./SessionCard";

export function DashboardScreen() {
  const [dashboard, setDashboard] = useState<KaderDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getKaderDashboard()
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
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
            Halo, Kak {dashboard.fullName}!
          </h1>
          <p className="mt-1 text-body-md text-on-surface-variant">Siap membantu teman-teman hari ini?</p>
        </div>
        <StatusToggle status={dashboard.status} />
      </div>

      <div>
        <h2 className="mb-4 text-headline-md text-on-surface">Konsultasi Aktif</h2>
        {dashboard.activeSessions.length === 0 ? (
          <p className="text-body-md text-on-surface-variant">Belum ada konsultasi aktif saat ini.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {dashboard.activeSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the Beranda page**

Replace the full contents of `src/app/kader/(protected)/page.tsx`:

```tsx
import { DashboardScreen } from "@/components/kader/DashboardScreen";

export default function KaderHomePage() {
  return <DashboardScreen />;
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`, log in as a verified kader at `/kader/login`, and confirm `/kader` renders the greeting, status toggle, and either the empty state or session cards (create a test session assigned to that kader via the Supabase dashboard if you want to see a populated card).

- [ ] **Step 5: Commit**

```bash
git add src/components/kader/DashboardScreen.tsx "src/app/kader/(protected)/page.tsx"
git commit -m "feat(kader): wire up the Beranda dashboard screen"
```

---

### Task 9: Kader Ruang Chat — component and route

**Files:**
- Create: `src/components/kader/ChatScreen.tsx`
- Create: `src/app/kader/chat/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `useSessionChat` (existing, unmodified) from `@/lib/chat/useSessionChat`; `endKaderSession` (Task 4), `getSessionStudentInfo` (Task 5) from `@/lib/kader/actions`; `SessionStudentInfo` from `@/lib/kader/types`; `Button`, `Chip`, `ChatBubble` from `@/components/ui/*`; `TOPIC_LABELS` from `@/lib/student/types`; `createClient` from `@/lib/supabase/server`.
- Produces: `ChatScreen({ sessionId: string })` in `src/components/kader/ChatScreen.tsx`; the `/kader/chat/[sessionId]` route.

- [ ] **Step 1: Implement the chat screen**

Create `src/components/kader/ChatScreen.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { useSessionChat } from "@/lib/chat/useSessionChat";
import { endKaderSession, getSessionStudentInfo } from "@/lib/kader/actions";
import { TOPIC_LABELS } from "@/lib/student/types";
import type { SessionStudentInfo } from "@/lib/kader/types";

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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function ChatScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [ending, setEnding] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [studentInfo, setStudentInfo] = useState<SessionStudentInfo | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, error, send } = useSessionChat(sessionId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    getSessionStudentInfo({ sessionId })
      .then(setStudentInfo)
      .catch(() => {
        // Non-fatal: keep the generic fallback header if this fails.
      });
  }, [sessionId]);

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setSendError(null);
    try {
      await send(body);
      setDraft("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Pesan gagal terkirim, coba lagi");
    }
  }

  async function handleEnd() {
    setEnding(true);
    setSendError(null);
    try {
      await endKaderSession({ sessionId });
      router.push("/kader");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Gagal mengakhiri sesi, coba lagi");
      setEnding(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-lowest px-sm py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.back()} aria-label="Kembali">
            ←
          </button>
          <div>
            <p className="text-label-md font-semibold text-on-surface">
              {studentInfo?.displayName ?? "Siswa"}
            </p>
            {studentInfo && studentInfo.topics.length > 0 && (
              <Chip tone="secondary" className="mt-1">
                {TOPIC_LABELS[studentInfo.topics[0]]}
              </Chip>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" disabled title="Segera hadir">
            Alihkan
          </Button>
          <Button variant="ghost" disabled title="Segera hadir">
            Hubungi Guru/BK
          </Button>
          <Button variant="ghost" onClick={handleEnd} disabled={ending}>
            {ending ? "Mengakhiri..." : "Selesaikan Sesi"}
          </Button>
        </div>
      </header>

      <div className="border-b border-outline-variant bg-secondary-container px-sm py-2 text-label-sm text-on-secondary-container">
        ℹ️ Sesi ini dipantau oleh guru/BK demi keamanan.
      </div>

      {error && (
        <p className="mx-sm mt-2 rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      {sendError && (
        <p className="mx-sm mt-2 rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {sendError}
        </p>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-sm">
        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            senderRole={message.senderRole}
            viewerRole="kader"
            body={message.body}
            timestamp={formatTime(message.createdAt)}
            avatarNode={
              message.senderRole !== "kader" ? (
                <StudentAvatar displayName={studentInfo?.displayName} />
              ) : undefined
            }
            readReceipt={message.senderRole === "kader" ? "sent" : undefined}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-outline-variant bg-surface-container-lowest p-sm">
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
    </main>
  );
}
```

- [ ] **Step 2: Add the route**

Create `src/app/kader/chat/[sessionId]/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ChatScreen } from "@/components/kader/ChatScreen";

export default async function KaderChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/kader/login");
  }

  return <ChatScreen sessionId={sessionId} />;
}
```

This route is intentionally outside the `(protected)` group — like the student chat screen, it owns its own full-bleed layout rather than being wrapped in `KaderShell`'s sidebar/bottom-nav chrome. It does its own minimal "is anyone logged in" check; per-session authorization is enforced by RLS inside `getSessionStudentInfoCore`/`sendMessageCore`/`endKaderSessionCore`, so an unassigned or unverified kader hitting an arbitrary session id gets "Sesi tidak ditemukan" from those, not a silent wrong-data render.

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. Using a test session assigned to your logged-in kader (create one directly via the Supabase dashboard if needed: insert into `sessions` with `assigned_to` = your kader's `profiles.id`, `status = 'active'`, `topics = '{akademik}'`), open `/kader/chat/<sessionId>`, confirm the header shows a display name + topic chip, send a message, confirm it appears, click "Selesaikan Sesi" and confirm it redirects to `/kader` and the session disappears from the dashboard.

- [ ] **Step 5: Commit**

```bash
git add src/components/kader/ChatScreen.tsx "src/app/kader/chat/[sessionId]/page.tsx"
git commit -m "feat(kader): add Ruang Chat screen and route"
```

---

### Task 10: Kader Profil page (Phase 1 minimal)

**Files:**
- Create: `src/app/kader/(protected)/profil/page.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/server`; `StatusToggle` (Task 6) from `@/components/kader/StatusToggle`; `KaderStatus` from `@/lib/student/types`.
- Produces: the `/kader/profil` route (previously a 404 despite being linked from the nav).

- [ ] **Step 1: Implement**

Create `src/app/kader/(protected)/profil/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusToggle } from "@/components/kader/StatusToggle";
import type { KaderStatus } from "@/lib/student/types";

export default async function KaderProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/kader/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, status")
    .eq("id", user.id)
    .single();

  const fullName = (profile?.full_name as string | null) ?? "Kader";
  const status = (profile?.status as KaderStatus | null) ?? "offline";
  const initial = fullName.trim().charAt(0).toUpperCase() || "K";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-md text-center">
        <div
          aria-hidden="true"
          className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-fixed text-headline-lg text-on-primary-fixed"
        >
          {initial}
        </div>
        <h1 className="text-headline-md font-bold text-on-surface">Kak {fullName}</h1>
        <p className="rounded-full bg-primary-fixed-dim px-3 py-1 text-label-md text-primary">Kader Aktif</p>
      </div>

      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-md">
        <h2 className="mb-4 text-headline-md text-on-surface">Status Kehadiran</h2>
        <StatusToggle status={status} />
      </div>

      <p className="text-body-md text-on-surface-variant">
        Pengaturan bio dan topik konsultasi akan tersedia pada pembaruan berikutnya.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, navigate to `/kader/profil` while logged in as a verified kader, confirm the name/status render and the status toggle works (and updates the Beranda toggle too, on next visit).

- [ ] **Step 4: Commit**

```bash
git add "src/app/kader/(protected)/profil/page.tsx"
git commit -m "feat(kader): add minimal Profil page (identity + status)"
```

---

### Task 11: Full regression pass and manual walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: PASS — `tests/schema.test.ts`, `tests/chat.test.ts`, `tests/student-actions.test.ts`, `tests/student-types.test.ts`, `tests/kader-actions.test.ts` all green.

- [ ] **Step 2: Type-check and lint the whole project**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual end-to-end walkthrough**

Run: `npm run dev`. As a verified kader:
1. Log in at `/kader/login` — lands on `/kader` with the greeting, status toggle (default from your seeded `profiles.status`), and either the empty state or session cards.
2. Toggle status between Tersedia/Sibuk/Offline — confirm the pill highlight updates immediately with no full-page reload.
3. Create a session assigned to this kader via the Supabase dashboard (`sessions` table: `assigned_to` = this kader's id, `status = 'active'`, `topics = '{akademik}'`, plus one row in `messages` with `sender_role = 'student'`), refresh `/kader`, confirm the card appears with the right topic chip and message preview.
4. Click the card, confirm `/kader/chat/<id>` shows the header (display name + topic), the monitored-by-guru notice, and the seeded message.
5. Send a reply, confirm it appears immediately as a right-aligned bubble.
6. Confirm "Alihkan" and "Hubungi Guru/BK" render but are disabled (no click handler, greyed out).
7. Click "Selesaikan Sesi", confirm it redirects to `/kader` and the session is gone from the active list.
8. Visit `/kader/profil`, confirm identity + status toggle render and stay in sync with the one on `/kader`.

- [ ] **Step 4: Confirm no unrelated regressions**

Log in as a guru and as a student (existing flows) and confirm both still work — this plan didn't touch `src/app/guru/`, `src/app/student/`, or `src/lib/chat/`, but the `student/types.ts`/`student/actions.ts` edit in Task 1 is a shared file worth a quick sanity check (e.g. re-run the student welcome → topik → kader → konfirmasi → chat flow once).
