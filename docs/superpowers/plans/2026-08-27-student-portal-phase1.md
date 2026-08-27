# Student Portal Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real student flow — Welcome → Pilih Topik → Pilih Kader → Konfirmasi → Ruang Chat — so a student can generate an anonymous identity, pick a topic and a kader, start a session, and hold a live conversation end-to-end, replacing the current stub at `src/app/student/page.tsx`.

**Architecture:** Next.js 16 App Router, Server Actions using a service-role Supabase client for all student-side reads/writes (students have no Supabase Auth session — `studentLocalId` from `localStorage` is the bearer token). A small in-memory React Context carries the topic→kader→confirm wizard selection across three route-grouped pages. Live chat reuses the existing `useSessionChat` hook and `sendMessage`/`getSessionMessages` Server Actions from Foundation unchanged.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, TypeScript, Tailwind CSS v4, Supabase (`@supabase/supabase-js`, `@supabase/ssr`), Vitest (integration tests against the real Supabase project via `.env.local`).

**Spec:** `docs/superpowers/specs/2026-08-27-student-portal-design.md` (and the infrastructure it builds on: `docs/superpowers/specs/2026-08-25-peer-counseling-foundation-design.md`)

## Global Constraints

- No Supabase Auth for students — identity is a `crypto.randomUUID()` kept in `localStorage`, never a cookie/session (spec §5).
- All student-side DB access goes through `"use server"` actions using `createServiceClient()` from `src/lib/supabase/service.ts`, never a direct client-side Supabase call (spec §6, Foundation §3).
- Every student action that touches an existing row must check `student_local_id === studentLocalId` before acting (Foundation §3).
- Wizard state (`topics`, chosen kader) is in-memory React Context only, not query params, not persisted (spec §4, Foundation §8).
- No route in this phase uses `StudentShell` — wizard/chat screens are focused, single-purpose, no persistent nav chrome (spec §3).
- Kader presence is a snapshot read on load, no realtime presence subscription (spec §3, Foundation §7).
- Test convention in this repo: Vitest integration tests hitting the **real** Supabase project configured in `.env.local` via `tests/helpers.ts`, not mocks (see `tests/chat.test.ts`, `tests/schema.test.ts`).

---

## Task 0: Apply the schema migration (manual, blocking)

This task has no code to write — it's a gate. Every later task that touches `sessions` depends on it.

- [ ] **Step 1: Hand the user this exact SQL to run in the Supabase Dashboard → SQL Editor for this project**

```sql
alter table public.sessions
  drop column topic,
  add column topics public.topic[] not null default '{}';

alter table public.sessions
  alter column topics drop default;
```

(The `drop default` after the `add column` is deliberate: it lets the `add column ... default '{}'` backfill any existing rows without a transient not-null violation, then removes the default so new inserts are forced to supply `topics` explicitly, matching every other required column in this table.)

- [ ] **Step 2: Ask the user to confirm the statement ran successfully** (e.g. "Success. No rows returned" in the SQL Editor) before continuing to Task 1. Do not proceed on an assumption — wait for their confirmation.

---

## Task 1: Update `schema.sql` and the test helper to match

**Files:**
- Modify: `supabase/schema.sql` (the `sessions` table definition, ~line 180-190)
- Modify: `tests/helpers.ts` (`createTestSession`, ~line 89-106)

**Interfaces:**
- Produces: `createTestSession(input: { studentLocalId: string; assignedTo?: string; topics?: string[] })` — note the renamed `topics` (array) parameter, used by Task 5's tests.

- [ ] **Step 1: Update `supabase/schema.sql`** — change the `sessions` table's `topic` column to `topics`, keeping the file as the accurate source of truth for what Task 0's SQL just did live:

Find this block:

```sql
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
```

Replace `topic public.topic not null,` with `topics public.topic[] not null,`.

- [ ] **Step 2: Update `tests/helpers.ts`'s `createTestSession`**

Replace:

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
```

With:

```ts
export async function createTestSession(input: {
  studentLocalId: string;
  assignedTo?: string;
  topics?: string[];
}): Promise<string> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("sessions")
    .insert({
      student_local_id: input.studentLocalId,
      assigned_to: input.assignedTo ?? null,
      topics: input.topics ?? ["akademik"],
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("insert failed");
  return data.id as string;
}
```

- [ ] **Step 3: Run the existing test suite to confirm nothing broke**

Run: `npm test`
Expected: All existing tests in `tests/chat.test.ts` and `tests/schema.test.ts` PASS (they use `createTestSession` without ever passing `topic`/`topics`, so the default `["akademik"]` keeps them working unchanged).

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql tests/helpers.ts
git commit -m "feat(student): migrate sessions.topic to sessions.topics array"
```

---

## Task 2: Student domain types and identity helper

**Files:**
- Create: `src/lib/student/types.ts`
- Create: `src/lib/student/identity.ts`

**Interfaces:**
- Produces: `Topic` type, `TOPIC_LABELS: Record<Topic, string>`, `TOPIC_EMOJI: Record<Topic, string>`, `KaderStatus` type, `KaderSummary` type — used by Tasks 3-4 (actions) and Tasks 7-11 (pages).
- Produces: `getStudentLocalId(): string | null`, `setStudentLocalId(id: string): void` — used by Tasks 9-12 (pages).

- [ ] **Step 1: Create `src/lib/student/types.ts`**

```ts
export type Topic =
  | "pertemanan"
  | "bullying"
  | "keluarga"
  | "akademik"
  | "perasaan"
  | "lingkungan_sekolah"
  | "lainnya";

export const TOPICS: Topic[] = [
  "pertemanan",
  "bullying",
  "keluarga",
  "akademik",
  "perasaan",
  "lingkungan_sekolah",
  "lainnya",
];

export const TOPIC_LABELS: Record<Topic, string> = {
  pertemanan: "Pertemanan",
  bullying: "Bullying",
  keluarga: "Keluarga",
  akademik: "Akademik",
  perasaan: "Perasaan",
  lingkungan_sekolah: "Lingkungan Sekolah",
  lainnya: "Lainnya",
};

export const TOPIC_EMOJI: Record<Topic, string> = {
  pertemanan: "🤝",
  bullying: "🛡️",
  keluarga: "🏡",
  akademik: "📚",
  perasaan: "💭",
  lingkungan_sekolah: "🏫",
  lainnya: "✨",
};

export type KaderStatus = "available" | "busy" | "offline";

export type KaderSummary = {
  id: string;
  fullName: string;
  bio: string | null;
  topics: Topic[];
  status: KaderStatus;
};
```

- [ ] **Step 2: Create `src/lib/student/identity.ts`**

```ts
const STORAGE_KEY = "ruang-cerita:student-id";

export function getStudentLocalId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function setStudentLocalId(id: string): void {
  window.localStorage.setItem(STORAGE_KEY, id);
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors referencing `src/lib/student/types.ts` or `src/lib/student/identity.ts` (pre-existing unrelated errors in `.next/types` / `tests/*` from missing dev-only type packages are fine — see note below).

> Note for whoever runs this: this repo's `tsc --noEmit` already reports a handful of pre-existing errors unrelated to any of these tasks (a stale `.next/types/validator.ts` entry, and `tests/*`/`vitest.config.ts` "Cannot find module 'vitest'"/'ws'/'dotenv'" if `devDependencies` aren't installed in this run). Only new errors pointing at files this plan touches are this task's concern.

- [ ] **Step 4: Commit**

```bash
git add src/lib/student/types.ts src/lib/student/identity.ts
git commit -m "feat(student): add domain types and localStorage identity helper"
```

---

## Task 3: `createStudentIdentity` Server Action

**Files:**
- Create: `src/lib/student/actions.ts`
- Test: `tests/student-actions.test.ts`

**Interfaces:**
- Consumes: `createServiceClient()` from `src/lib/supabase/service.ts` (exists, no args, returns `SupabaseClient`).
- Produces: `createStudentIdentity(input: { localId: string; nickname?: string }): Promise<{ id: string }>` — used by Task 11 (welcome page).

- [ ] **Step 1: Write the failing test** — create `tests/student-actions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createStudentIdentity } from "@/lib/student/actions";
import { getServiceClient, deleteTestStudentIdentity } from "./helpers";

describe("createStudentIdentity", () => {
  it("creates a student_identities row with the given id and nickname", async () => {
    const localId = randomUUID();
    try {
      const result = await createStudentIdentity({ localId, nickname: "Sahabat Langit" });
      expect(result.id).toBe(localId);

      const service = getServiceClient();
      const { data, error } = await service
        .from("student_identities")
        .select("id, nickname, avatar_seed")
        .eq("id", localId)
        .single();

      expect(error).toBeNull();
      expect(data?.nickname).toBe("Sahabat Langit");
      expect(data?.avatar_seed).toBeTruthy();
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });

  it("allows creating an identity without a nickname", async () => {
    const localId = randomUUID();
    try {
      const result = await createStudentIdentity({ localId });
      expect(result.id).toBe(localId);
    } finally {
      await deleteTestStudentIdentity(localId);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/student-actions.test.ts`
Expected: FAIL — `Cannot find module '@/lib/student/actions'`

- [ ] **Step 3: Create `src/lib/student/actions.ts`**

```ts
"use server";

import { createServiceClient } from "@/lib/supabase/service";
import type { Topic, KaderSummary } from "./types";

const AVATAR_SEEDS = ["kucing", "kelinci", "rubah", "beruang", "burung", "rusa", "panda", "koala"];

function randomAvatarSeed(): string {
  return AVATAR_SEEDS[Math.floor(Math.random() * AVATAR_SEEDS.length)];
}

export async function createStudentIdentity(input: {
  localId: string;
  nickname?: string;
}): Promise<{ id: string }> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("student_identities")
    .insert({
      id: input.localId,
      nickname: input.nickname || null,
      avatar_seed: randomAvatarSeed(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Gagal membuat identitas");
  }

  return { id: data.id as string };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/student-actions.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/student/actions.ts tests/student-actions.test.ts
git commit -m "feat(student): add createStudentIdentity server action"
```

---

## Task 4: `listAvailableKader` Server Action

**Files:**
- Modify: `src/lib/student/actions.ts`
- Modify: `tests/student-actions.test.ts`

**Interfaces:**
- Consumes: `KaderSummary` type from `src/lib/student/types.ts` (Task 2).
- Produces: `listAvailableKader(): Promise<KaderSummary[]>` — used by Task 9 (kader picker page).

- [ ] **Step 1: Write the failing test.** First update the two import lines at the
  top of `tests/student-actions.test.ts` to pull in the extra names this task needs:

Replace:

```ts
import { createStudentIdentity } from "@/lib/student/actions";
import { getServiceClient, deleteTestStudentIdentity } from "./helpers";
```

With:

```ts
import { createStudentIdentity, listAvailableKader } from "@/lib/student/actions";
import { getServiceClient, deleteTestStudentIdentity, createTestUser, deleteTestUser } from "./helpers";
```

Then append this new `describe` block at the end of the file:

```ts
describe("listAvailableKader", () => {
  it("returns only verified kader, with the expected shape", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const verifiedKader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(verifiedKader.id));

      const service = getServiceClient();
      await service
        .from("profiles")
        .update({ bio: "Suka dengerin cerita", topics: ["akademik", "keluarga"], status: "available" })
        .eq("id", verifiedKader.id);

      const unverifiedKader = await createTestUser("kader", { verified: false });
      cleanup.push(() => deleteTestUser(unverifiedKader.id));

      const guru = await createTestUser("guru", { verified: true });
      cleanup.push(() => deleteTestUser(guru.id));

      const result = await listAvailableKader();
      const ids = result.map((k) => k.id);

      expect(ids).toContain(verifiedKader.id);
      expect(ids).not.toContain(unverifiedKader.id);
      expect(ids).not.toContain(guru.id);

      const found = result.find((k) => k.id === verifiedKader.id)!;
      expect(found.bio).toBe("Suka dengerin cerita");
      expect(found.topics).toEqual(["akademik", "keluarga"]);
      expect(found.status).toBe("available");
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/student-actions.test.ts`
Expected: FAIL — `listAvailableKader is not a function` / `Cannot find export`

- [ ] **Step 3: Add `listAvailableKader` to `src/lib/student/actions.ts`**

```ts
export async function listAvailableKader(): Promise<KaderSummary[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("id, full_name, bio, topics, status")
    .eq("role", "kader")
    .eq("is_verified", true);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    fullName: (row.full_name as string | null) ?? "Kader",
    bio: row.bio as string | null,
    topics: (row.topics as Topic[] | null) ?? [],
    status: row.status as KaderSummary["status"],
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/student-actions.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/student/actions.ts tests/student-actions.test.ts
git commit -m "feat(student): add listAvailableKader server action"
```

---

## Task 5: `startSession` and `endSession` Server Actions

**Files:**
- Modify: `src/lib/student/actions.ts`
- Modify: `tests/student-actions.test.ts`

**Interfaces:**
- Consumes: `createTestSession` from `tests/helpers.ts` (Task 1's updated signature).
- Produces: `startSession(input: { studentLocalId: string; topics: Topic[]; kaderId: string }): Promise<{ sessionId: string }>`, `endSession(input: { sessionId: string; studentLocalId: string }): Promise<void>` — used by Task 10 (konfirmasi page) and Task 12 (chat page).

- [ ] **Step 1: Write the failing tests.** First update the two import lines at the
  top of `tests/student-actions.test.ts` again:

Replace:

```ts
import { createStudentIdentity, listAvailableKader } from "@/lib/student/actions";
import { getServiceClient, deleteTestStudentIdentity, createTestUser, deleteTestUser } from "./helpers";
```

With:

```ts
import { createStudentIdentity, listAvailableKader, startSession, endSession } from "@/lib/student/actions";
import {
  getServiceClient,
  deleteTestStudentIdentity,
  createTestUser,
  deleteTestUser,
  createTestStudentIdentity,
  createTestSession,
  deleteTestSession,
} from "./helpers";
```

Then append these two new `describe` blocks at the end of the file:

```ts
describe("startSession", () => {
  it("creates an active session assigned to an available kader", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const kader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kader.id));
      const service = getServiceClient();
      await service.from("profiles").update({ status: "available" }).eq("id", kader.id);

      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      const { sessionId } = await startSession({
        studentLocalId: localId,
        topics: ["akademik", "perasaan"],
        kaderId: kader.id,
      });
      cleanup.push(() => deleteTestSession(sessionId));

      const { data, error } = await service
        .from("sessions")
        .select("status, assigned_to, topics, started_at")
        .eq("id", sessionId)
        .single();

      expect(error).toBeNull();
      expect(data?.status).toBe("active");
      expect(data?.assigned_to).toBe(kader.id);
      expect(data?.topics).toEqual(["akademik", "perasaan"]);
      expect(data?.started_at).toBeTruthy();
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });

  it("rejects starting a session with a kader who is not available", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const kader = await createTestUser("kader", { verified: true });
      cleanup.push(() => deleteTestUser(kader.id));
      const service = getServiceClient();
      await service.from("profiles").update({ status: "busy" }).eq("id", kader.id);

      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      await expect(
        startSession({ studentLocalId: localId, topics: ["akademik"], kaderId: kader.id }),
      ).rejects.toThrow("tidak tersedia");
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });
});

describe("endSession", () => {
  it("marks a session ended when called by its owning student", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));

      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await endSession({ sessionId, studentLocalId: localId });

      const service = getServiceClient();
      const { data } = await service
        .from("sessions")
        .select("status, ended_at")
        .eq("id", sessionId)
        .single();

      expect(data?.status).toBe("ended");
      expect(data?.ended_at).toBeTruthy();
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });

  it("rejects ending a session that belongs to a different student", async () => {
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const otherLocalId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(otherLocalId));

      const sessionId = await createTestSession({ studentLocalId: localId });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(
        endSession({ sessionId, studentLocalId: otherLocalId }),
      ).rejects.toThrow("Tidak diizinkan");
    } finally {
      for (const fn of cleanup.reverse()) {
        await fn();
      }
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/student-actions.test.ts`
Expected: FAIL — `startSession`/`endSession` not exported

- [ ] **Step 3: Add `startSession` and `endSession` to `src/lib/student/actions.ts`**

```ts
export async function startSession(input: {
  studentLocalId: string;
  topics: Topic[];
  kaderId: string;
}): Promise<{ sessionId: string }> {
  const service = createServiceClient();

  const { data: kader, error: kaderError } = await service
    .from("profiles")
    .select("status")
    .eq("id", input.kaderId)
    .single();

  if (kaderError || !kader) {
    throw new Error("Kader tidak ditemukan");
  }
  if (kader.status !== "available") {
    throw new Error("Kader ini sudah tidak tersedia, silakan pilih kader lain");
  }

  const { data, error } = await service
    .from("sessions")
    .insert({
      student_local_id: input.studentLocalId,
      assigned_to: input.kaderId,
      topics: input.topics,
      status: "active",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Gagal memulai sesi");
  }

  return { sessionId: data.id as string };
}

export async function endSession(input: {
  sessionId: string;
  studentLocalId: string;
}): Promise<void> {
  const service = createServiceClient();

  const { data: session, error: findError } = await service
    .from("sessions")
    .select("student_local_id")
    .eq("id", input.sessionId)
    .single();

  if (findError || !session) {
    throw new Error("Sesi tidak ditemukan");
  }
  if (session.student_local_id !== input.studentLocalId) {
    throw new Error("Tidak diizinkan mengakhiri sesi ini");
  }

  const { error } = await service
    .from("sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", input.sessionId);

  if (error) {
    throw new Error(error.message);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/student-actions.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/student/actions.ts tests/student-actions.test.ts
git commit -m "feat(student): add startSession and endSession server actions"
```

---

## Task 6: Extend `ChatBubble` with avatar and read-receipt props

**Files:**
- Modify: `src/components/ui/ChatBubble.tsx`

**Interfaces:**
- Produces: `ChatBubbleProps` gains two new optional fields — `avatarNode?: ReactNode`, `readReceipt?: "sent"`. Existing callers (none yet in this codebase) are unaffected since both are optional. Used by Task 12 (chat page).

- [ ] **Step 1: Replace the full contents of `src/components/ui/ChatBubble.tsx`**

```tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { SenderRole } from "@/lib/chat/types";

type ChatBubbleProps = {
  senderRole: SenderRole;
  body: string;
  timestamp: string;
  viewerRole: SenderRole;
  avatarNode?: ReactNode;
  readReceipt?: "sent";
};

export function ChatBubble({
  senderRole,
  body,
  timestamp,
  viewerRole,
  avatarNode,
  readReceipt,
}: ChatBubbleProps) {
  const isOwn = senderRole === viewerRole;

  return (
    <div className={cn("flex items-end gap-2", isOwn ? "justify-end" : "justify-start")}>
      {!isOwn && avatarNode}
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
            "mt-1 flex items-center gap-1 text-label-sm",
            isOwn ? "text-on-primary/70" : "text-on-surface-variant",
          )}
        >
          {timestamp}
          {isOwn && readReceipt === "sent" && <span aria-hidden="true">✓</span>}
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/components/ui/ChatBubble.tsx`
Expected: no errors for this file

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/ChatBubble.tsx
git commit -m "feat(student): extend ChatBubble with avatar and read-receipt props"
```

---

## Task 7: Wizard context and shared step layout

**Files:**
- Create: `src/app/student/(wizard)/wizard-context.tsx`
- Create: `src/app/student/(wizard)/layout.tsx`

**Interfaces:**
- Consumes: `Topic` from `src/lib/student/types.ts` (Task 2), `KaderSummary` from the same file.
- Produces: `StoryWizardProvider` (component), `useStoryWizard(): { topics: Topic[]; kader: KaderSummary | null; toggleTopic: (t: Topic) => void; setKader: (k: KaderSummary) => void; reset: () => void }` — used by Tasks 8-10 (topik/kader/konfirmasi pages).

- [ ] **Step 1: Create `src/app/student/(wizard)/wizard-context.tsx`**

```tsx
"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { KaderSummary, Topic } from "@/lib/student/types";

type StoryWizardContextValue = {
  topics: Topic[];
  kader: KaderSummary | null;
  toggleTopic: (topic: Topic) => void;
  setKader: (kader: KaderSummary) => void;
  reset: () => void;
};

const StoryWizardContext = createContext<StoryWizardContextValue | null>(null);

export function StoryWizardProvider({ children }: { children: ReactNode }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [kader, setKaderState] = useState<KaderSummary | null>(null);

  const toggleTopic = useCallback((topic: Topic) => {
    setTopics((current) =>
      current.includes(topic) ? current.filter((t) => t !== topic) : [...current, topic],
    );
  }, []);

  const setKader = useCallback((next: KaderSummary) => {
    setKaderState(next);
  }, []);

  const reset = useCallback(() => {
    setTopics([]);
    setKaderState(null);
  }, []);

  const value = useMemo(
    () => ({ topics, kader, toggleTopic, setKader, reset }),
    [topics, kader, toggleTopic, setKader, reset],
  );

  return <StoryWizardContext.Provider value={value}>{children}</StoryWizardContext.Provider>;
}

export function useStoryWizard(): StoryWizardContextValue {
  const ctx = useContext(StoryWizardContext);
  if (!ctx) {
    throw new Error("useStoryWizard must be used within StoryWizardProvider");
  }
  return ctx;
}
```

- [ ] **Step 2: Create `src/app/student/(wizard)/layout.tsx`**

```tsx
"use client";

import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { StoryWizardProvider } from "./wizard-context";

const STEP_BY_PATH: Record<string, number> = {
  "/student/topik": 1,
  "/student/kader": 2,
  "/student/konfirmasi": 3,
};

function StepHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const step = STEP_BY_PATH[pathname] ?? 1;

  return (
    <header className="border-b border-outline-variant bg-surface-container-lowest px-sm py-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Kembali"
          className="text-headline-md text-on-surface-variant"
        >
          ←
        </button>
        <p className="text-label-md font-semibold text-on-surface">Ruang Cerita</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Tutup"
          className="text-headline-md text-on-surface-variant"
        >
          ✕
        </button>
      </div>
      <p className="mt-2 text-label-sm text-on-surface-variant">Langkah {step} dari 3</p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>
    </header>
  );
}

export default function WizardLayout({ children }: { children: ReactNode }) {
  return (
    <StoryWizardProvider>
      <main className="min-h-screen bg-surface">
        <StepHeader />
        <div className="mx-auto max-w-[36rem] p-sm">{children}</div>
      </main>
    </StoryWizardProvider>
  );
}
```

Note: `max-w-[36rem]` is used deliberately instead of a named `max-w-*` class — this codebase's `globals.css` defines custom `--spacing-sm/md/lg/xl` tokens that collide with Tailwind's built-in named `max-w-sm/md/lg/xl` scale (documented and worked around the same way in `src/components/auth/LoginCard.tsx`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors for files under `src/app/student/(wizard)/`

- [ ] **Step 4: Commit**

```bash
git add "src/app/student/(wizard)/wizard-context.tsx" "src/app/student/(wizard)/layout.tsx"
git commit -m "feat(student): add story wizard context and shared step header layout"
```

---

## Task 8: `/student/topik` — pick topic page

**Files:**
- Create: `src/app/student/(wizard)/topik/page.tsx`

**Interfaces:**
- Consumes: `useStoryWizard()` (Task 7), `TOPICS`/`TOPIC_LABELS`/`TOPIC_EMOJI`/`Topic` from `src/lib/student/types.ts` (Task 2).

- [ ] **Step 1: Create `src/app/student/(wizard)/topik/page.tsx`**

```tsx
"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { TOPICS, TOPIC_EMOJI, TOPIC_LABELS, type Topic } from "@/lib/student/types";
import { useStoryWizard } from "../wizard-context";

function TopicCard({
  topic,
  selected,
  onToggle,
}: {
  topic: Topic;
  selected: boolean;
  onToggle: (topic: Topic) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(topic)}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border-2 p-md text-center transition-colors",
        selected
          ? "border-primary bg-primary-fixed text-on-primary-fixed"
          : "border-outline-variant bg-surface-container-lowest text-on-surface hover:bg-surface-container-low",
      )}
    >
      <span className="text-headline-md" aria-hidden="true">
        {TOPIC_EMOJI[topic]}
      </span>
      <span className="text-label-md font-semibold">{TOPIC_LABELS[topic]}</span>
    </button>
  );
}

export default function PilihTopikPage() {
  const router = useRouter();
  const { topics, toggleTopic } = useStoryWizard();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-md font-bold text-on-surface">
          Apa yang ingin kamu ceritakan hari ini?
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Kamu bisa pilih lebih dari satu topik.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TOPICS.map((topic) => (
          <TopicCard
            key={topic}
            topic={topic}
            selected={topics.includes(topic)}
            onToggle={toggleTopic}
          />
        ))}
      </div>

      <Button
        className="ml-auto"
        disabled={topics.length === 0}
        onClick={() => router.push("/student/kader")}
      >
        Lanjut →
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint "src/app/student/(wizard)/topik/page.tsx"`
Expected: no errors for this file

- [ ] **Step 3: Commit**

```bash
git add "src/app/student/(wizard)/topik/page.tsx"
git commit -m "feat(student): add pilih topik wizard step"
```

---

## Task 9: `/student/kader` — pick kader page

**Files:**
- Create: `src/app/student/(wizard)/kader/page.tsx`

**Interfaces:**
- Consumes: `useStoryWizard()` (Task 7), `listAvailableKader()` (Task 4), `KaderSummary`/`Topic`/`TOPIC_LABELS` (Task 2), `Chip` (`src/components/ui/Chip.tsx`, exists).

- [ ] **Step 1: Create `src/app/student/(wizard)/kader/page.tsx`**

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { listAvailableKader } from "@/lib/student/actions";
import { TOPIC_LABELS, type KaderSummary, type Topic } from "@/lib/student/types";
import { useStoryWizard } from "../wizard-context";

function statusLabel(status: KaderSummary["status"]): string {
  if (status === "available") return "Sedang tersedia";
  if (status === "busy") return "Sedang Sibuk";
  return "Tersedia Nanti";
}

function KaderCard({ kader, onSelect }: { kader: KaderSummary; onSelect: (k: KaderSummary) => void }) {
  const initial = kader.fullName.trim().charAt(0).toUpperCase() || "K";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-fixed text-headline-md font-bold text-on-primary-fixed"
        >
          {initial}
        </div>
        <div>
          <p className="text-label-md font-semibold text-on-surface">Kak {kader.fullName}</p>
          <Chip tone={kader.status === "available" ? "primary" : "neutral"}>
            {statusLabel(kader.status)}
          </Chip>
        </div>
      </div>

      {kader.bio && <p className="text-body-md text-on-surface-variant">{kader.bio}</p>}

      {kader.topics.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {kader.topics.map((topic) => (
            <Chip key={topic} tone="secondary">
              {TOPIC_LABELS[topic]}
            </Chip>
          ))}
        </div>
      )}

      {kader.status === "available" ? (
        <Button onClick={() => onSelect(kader)}>Pilih Kak {kader.fullName}</Button>
      ) : (
        <Button variant="ghost" disabled>
          Ingatkan Saya
        </Button>
      )}
    </Card>
  );
}

export default function PilihKaderPage() {
  const router = useRouter();
  const { topics: selectedTopics, setKader } = useStoryWizard();
  const [kaderList, setKaderList] = useState<KaderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Topic | "semua">("semua");

  useEffect(() => {
    if (selectedTopics.length === 0) {
      router.replace("/student/topik");
      return;
    }
    listAvailableKader()
      .then(setKaderList)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat daftar kader"))
      .finally(() => setLoading(false));
  }, [selectedTopics, router]);

  const availableFilters = useMemo(() => {
    const topicSet = new Set<Topic>();
    for (const kader of kaderList) {
      for (const topic of kader.topics) topicSet.add(topic);
    }
    return Array.from(topicSet);
  }, [kaderList]);

  const filteredKader = useMemo(() => {
    if (filter === "semua") return kaderList;
    return kaderList.filter((k) => k.topics.includes(filter));
  }, [kaderList, filter]);

  function handleSelect(kader: KaderSummary) {
    setKader(kader);
    router.push("/student/konfirmasi");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-md font-bold text-on-surface">Pilih Teman Cerita</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Pilih kakak pendamping yang ingin kamu ajak bicara.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("semua")}
          className={cn(
            "rounded-full px-3 py-1 text-label-sm font-medium",
            filter === "semua"
              ? "bg-primary text-on-primary"
              : "bg-surface-container-high text-on-surface-variant",
          )}
        >
          Semua
        </button>
        {availableFilters.map((topic) => (
          <button
            key={topic}
            type="button"
            onClick={() => setFilter(topic)}
            className={cn(
              "rounded-full px-3 py-1 text-label-sm font-medium",
              filter === topic
                ? "bg-primary text-on-primary"
                : "bg-surface-container-high text-on-surface-variant",
            )}
          >
            {TOPIC_LABELS[topic]}
          </button>
        ))}
      </div>

      {loading && <p className="text-body-md text-on-surface-variant">Memuat daftar kader...</p>}
      {error && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-4">
        {filteredKader.map((kader) => (
          <KaderCard key={kader.id} kader={kader} onSelect={handleSelect} />
        ))}
        {!loading && !error && filteredKader.length === 0 && (
          <p className="text-body-md text-on-surface-variant">
            Belum ada kader yang tersedia untuk topik ini.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint "src/app/student/(wizard)/kader/page.tsx"`
Expected: no errors for this file

- [ ] **Step 3: Commit**

```bash
git add "src/app/student/(wizard)/kader/page.tsx"
git commit -m "feat(student): add pilih kader wizard step"
```

---

## Task 10: `/student/konfirmasi` — confirm and start session page

**Files:**
- Create: `src/app/student/(wizard)/konfirmasi/page.tsx`

**Interfaces:**
- Consumes: `useStoryWizard()` (Task 7), `startSession()` (Task 5), `getStudentLocalId()` (Task 2), `TOPIC_LABELS` (Task 2).

- [ ] **Step 1: Create `src/app/student/(wizard)/konfirmasi/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { startSession } from "@/lib/student/actions";
import { getStudentLocalId } from "@/lib/student/identity";
import { TOPIC_LABELS } from "@/lib/student/types";
import { useStoryWizard } from "../wizard-context";

export default function KonfirmasiPage() {
  const router = useRouter();
  const { topics, kader, reset } = useStoryWizard();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (topics.length === 0 || !kader) {
      router.replace("/student/topik");
    }
  }, [topics, kader, router]);

  if (topics.length === 0 || !kader) {
    return null;
  }

  async function handleStart() {
    const studentLocalId = getStudentLocalId();
    if (!studentLocalId) {
      router.replace("/student");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { sessionId } = await startSession({
        studentLocalId,
        topics,
        kaderId: kader!.id,
      });
      reset();
      router.push(`/student/chat/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memulai sesi");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-center">
        <p className="text-headline-lg" aria-hidden="true">
          ☕
        </p>
        <h1 className="mt-2 text-headline-md font-bold text-on-surface">
          Siap untuk mulai bercerita?
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Ambil waktu sejenak sebelum memulai percakapan.
        </p>
      </div>

      <Card className="flex flex-col gap-4">
        <div>
          <p className="text-label-sm text-on-surface-variant">Topik</p>
          <p className="text-body-md text-on-surface">
            {topics.map((t) => TOPIC_LABELS[t]).join(", ")}
          </p>
        </div>
        <div>
          <p className="text-label-sm text-on-surface-variant">Teman Cerita</p>
          <p className="text-body-md text-on-surface">Kak {kader.fullName}</p>
        </div>
      </Card>

      <div className="rounded-md border-l-4 border-secondary bg-secondary-container px-3 py-2 text-label-md text-on-secondary-container">
        🔒 Ruang Aman &amp; Rahasia — identitasmu tidak dibagikan ke siapa pun selain kakak
        pendamping dan guru BK yang memantau untuk keamananmu.
      </div>

      {error && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button onClick={handleStart} disabled={submitting}>
          {submitting ? "Memulai..." : "Mulai Chat Sekarang"}
        </Button>
        <Button variant="ghost" onClick={() => router.push("/student/kader")} disabled={submitting}>
          Kembali &amp; Ubah Pilihan
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint "src/app/student/(wizard)/konfirmasi/page.tsx"`
Expected: no errors for this file

- [ ] **Step 3: Commit**

```bash
git add "src/app/student/(wizard)/konfirmasi/page.tsx"
git commit -m "feat(student): add konfirmasi wizard step"
```

---

## Task 11: `/student` — rewritten welcome page

**Files:**
- Modify: `src/app/student/page.tsx` (full rewrite)

**Interfaces:**
- Consumes: `createStudentIdentity()` (Task 3), `getStudentLocalId()`/`setStudentLocalId()` (Task 2).

- [ ] **Step 1: Replace the full contents of `src/app/student/page.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { createStudentIdentity } from "@/lib/student/actions";
import { getStudentLocalId, setStudentLocalId } from "@/lib/student/identity";

export default function StudentWelcomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = getStudentLocalId();
    if (existing) {
      // TODO(Phase 2): once /student/cerita-saya exists, redirect there instead.
      router.replace("/student/topik");
      return;
    }
    setReady(true);
  }, [router]);

  async function handleStart() {
    setSubmitting(true);
    setError(null);
    try {
      const localId = crypto.randomUUID();
      await createStudentIdentity({ localId, nickname: nickname.trim() || undefined });
      setStudentLocalId(localId);
      router.push("/student/topik");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memulai, coba lagi");
      setSubmitting(false);
    }
  }

  if (!ready) {
    return null;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-sm">
      <Card className="w-full max-w-[24rem]">
        <h1 className="text-headline-lg font-bold text-on-surface">Halo, kamu tidak sendiri.</h1>
        <p className="mt-2 text-body-md text-on-surface-variant">
          Identitasmu tidak perlu diketahui untuk mulai bercerita.
        </p>

        <div className="mt-4 rounded-md border-l-4 border-secondary bg-secondary-container px-3 py-2 text-label-md text-on-secondary-container">
          🛡️ Percakapan ini dapat dipantau oleh guru/BK untuk menjaga keamananmu.
        </div>

        <label className="mt-6 flex flex-col gap-1 text-label-md font-semibold text-on-surface">
          Nama Panggilan (opsional)
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="mis. Sahabat Langit"
            className="rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
          />
        </label>

        {error && (
          <p className="mt-4 rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
            {error}
          </p>
        )}

        <Button className="mt-6 w-full" onClick={handleStart} disabled={submitting}>
          {submitting ? "Memulai..." : "Mulai Secara Anonim"}
        </Button>
      </Card>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint src/app/student/page.tsx`
Expected: no errors for this file

- [ ] **Step 3: Commit**

```bash
git add src/app/student/page.tsx
git commit -m "feat(student): rewrite welcome page with real onboarding flow"
```

---

## Task 12: `/student/chat/[sessionId]` — live chat page

**Files:**
- Create: `src/app/student/chat/[sessionId]/page.tsx`
- Create: `src/components/student/ChatScreen.tsx`

**Interfaces:**
- Consumes: `useSessionChat(sessionId, studentLocalId?)` from `src/lib/chat/useSessionChat.ts` (exists, Foundation), `ChatBubble` (Task 6), `endSession()` (Task 5), `getStudentLocalId()` (Task 2).

- [ ] **Step 1: Create `src/app/student/chat/[sessionId]/page.tsx`** (thin Server Component that awaits the async `params`, per this repo's Next.js 16 convention — see `src/app/kader/login/page.tsx` for the same `searchParams` pattern)

```tsx
import { ChatScreen } from "@/components/student/ChatScreen";

export default async function StudentChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ChatScreen sessionId={sessionId} />;
}
```

- [ ] **Step 2: Create `src/components/student/ChatScreen.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { useSessionChat } from "@/lib/chat/useSessionChat";
import { endSession } from "@/lib/student/actions";
import { getStudentLocalId } from "@/lib/student/identity";

function KaderAvatar() {
  return (
    <div
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-fixed text-label-sm font-bold text-on-secondary-fixed"
    >
      K
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function ChatScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [studentLocalId, setLocalId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [ending, setEnding] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = getStudentLocalId();
    if (!id) {
      router.replace("/student");
      return;
    }
    setLocalId(id);
  }, [router]);

  const { messages, error, send } = useSessionChat(sessionId, studentLocalId ?? undefined);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const body = draft.trim();
    if (!body || !studentLocalId) return;
    setDraft("");
    await send(body);
  }

  async function handleEnd() {
    if (!studentLocalId) return;
    setEnding(true);
    try {
      await endSession({ sessionId, studentLocalId });
    } finally {
      // TODO(Phase 2): once /student/cerita-saya exists, redirect there instead.
      router.push("/student/topik");
    }
  }

  if (!studentLocalId) {
    return null;
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-sm py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.back()} aria-label="Kembali">
            ←
          </button>
          <p className="text-label-md font-semibold text-on-surface">Kader</p>
        </div>
        <Button variant="ghost" onClick={handleEnd} disabled={ending}>
          {ending ? "Mengakhiri..." : "Selesaikan Sesi"}
        </Button>
      </header>

      <div className="border-b border-outline-variant bg-secondary-container px-sm py-2 text-label-sm text-on-secondary-container">
        ℹ️ Percakapan ini dapat dipantau oleh guru/BK.
      </div>

      {error && (
        <p className="mx-sm mt-2 rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-sm">
        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            senderRole={message.senderRole}
            viewerRole="student"
            body={message.body}
            timestamp={formatTime(message.createdAt)}
            avatarNode={message.senderRole !== "student" ? <KaderAvatar /> : undefined}
            readReceipt={message.senderRole === "student" ? "sent" : undefined}
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
          placeholder="Ketik pesan..."
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

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit -p tsconfig.json && npx eslint "src/app/student/chat/[sessionId]/page.tsx" src/components/student/ChatScreen.tsx`
Expected: no errors for these files

- [ ] **Step 4: Commit**

```bash
git add "src/app/student/chat/[sessionId]/page.tsx" src/components/student/ChatScreen.tsx
git commit -m "feat(student): add live chat screen"
```

---

## Task 13: End-to-end verification

This task has no new source files — it proves Tasks 0-12 work together as a real user would experience them, per this project's convention of driving the actual app with Playwright (see recent work on the login pages) rather than only trusting unit tests.

- [ ] **Step 1: Start (or reuse) the dev server**

Run: `npm run dev` in the background if not already running; poll `curl -sf http://localhost:3000` until it responds.

- [ ] **Step 2: Drive the full flow with Playwright** — navigate to `/student`, fill nickname, click "Mulai Secara Anonim"; on `/student/topik` select at least one topic and click "Lanjut →"; on `/student/kader` click "Pilih Kak {name}" for whichever kader is seeded as `available` in the Supabase project (if none exists, use the service-role client to create one via `createTestUser`-equivalent steps, or ask the user to mark an existing kader `status = 'available'` in the dashboard); on `/student/konfirmasi` click "Mulai Chat Sekarang"; on `/student/chat/[sessionId]` type a message and send it. Screenshot each screen.

- [ ] **Step 3: Verify message persistence and the receiving side** — using the service-role client (a short throwaway script, same pattern as `tests/helpers.ts`), confirm the sent message exists in `messages` for that `session_id`, then insert a second row with `sender_role = 'kader'` directly and confirm it appears in the browser via the realtime subscription (per spec §8 — there's no Kader portal UI yet to send it from a real client).

- [ ] **Step 4: Click "Selesaikan Sesi"** and confirm (via the service-role client) that the session's `status` is `'ended'` and `ended_at` is set.

- [ ] **Step 5: Report results to the user** — screenshots plus a summary of what was verified and any gaps (e.g. the known Phase 1 gaps already listed in the spec §8).
