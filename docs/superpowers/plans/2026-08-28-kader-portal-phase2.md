# Kader Portal Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three Phase 2 features the kader portal spec deferred: full Profil editing (bio + topics), Alihkan Konsultasi (transfer a session to another available kader), and Eskalasi ke Guru/BK (escalate a session) — replacing the disabled "Alihkan"/"Hubungi Guru/BK" chat-header buttons and the static Profil note that Phase 1 shipped as placeholders.

**Architecture:** Extends the existing `src/lib/kader/` module (`core.ts` RLS-scoped query/mutation functions + `actions.ts` thin `"use server"` wrappers) and `src/components/kader/` module with no schema changes — every table, column, RLS policy, and trigger this plan needs (`session_assignments`, `escalations`, `on_escalation_created`, `profiles.bio`/`profiles.topics`) already exists. Transfer and escalation both reuse the same two-client shape already established in Phase 1 (`getSessionStudentInfoCore`): the **authenticated** client proves session ownership via RLS, the **service** client (only where RLS can't reach — cross-kader `profiles` reads) does the rest. The transfer flow mirrors `takeOverConsultationCore` in `src/lib/guru/core.ts` almost exactly, just with the assignment direction reversed.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Supabase (Postgres + RLS + Realtime Broadcast), TypeScript, Tailwind v4, Vitest for integration tests against a real Supabase project (no schema changes in this plan).

**Spec:** `docs/superpowers/specs/2026-08-27-kader-portal-design.md` (§1 phasing, §2 "Phase 2 additions", §5 components)

## Global Constraints

- No schema/migration changes — every table, column, and RLS policy this plan uses already exists in `supabase/schema.sql`.
- All new kader-side reads/writes use the **authenticated** Supabase client (`createClient()` from `@/lib/supabase/server`) so RLS enforces authorization — never `createServiceClient()` for `profiles` (self-row), `sessions`, `session_assignments`, or `escalations` writes performed *as* the kader. The one recurring exception is looking up **other kaders'** `profiles` rows for the transfer candidate list (RLS's `profiles: baca profil sendiri` only allows reading your own row) — that always goes through the service client, and only after an RLS-scoped query has already proven the current kader owns the session in question.
- Every query-bearing function in `src/lib/kader/` is split into a `..Core(supabase, ...)` function in `core.ts` (takes an explicit `SupabaseClient`, no `"use server"`, unit-testable) and a same-named wrapper in `actions.ts` (`"use server"`, resolves `createClient()`, delegates to core) — do not put query logic directly in `actions.ts`.
- Reuse existing domain types/constants from `@/lib/student/types.ts` (`Topic`, `TOPICS`, `TOPIC_LABELS`, `KaderStatus`, `KaderSummary`) — do not redefine them under `src/lib/kader/`.
- All user-facing copy and thrown error messages are Bahasa Indonesia, matching the rest of the app and the exact error strings already established in Phase 1 / the guru portal (e.g. `"Sesi tidak ditemukan"`, `"Kader tidak ditemukan"`, `"Kader ini sudah tidak tersedia, silakan pilih kader lain"`).
- Do not add a "Ruang Chat" nav item or a "Menunggu" queue section — both are still out of scope per spec §6 and this plan doesn't touch that area.

---

### Task 1: Kader profile bio/topics — core, actions, and tests

**Files:**
- Modify: `src/lib/kader/types.ts`
- Modify: `src/lib/kader/core.ts`
- Modify: `src/lib/kader/actions.ts`
- Test: `tests/kader-actions.test.ts` (append)

**Interfaces:**
- Consumes: `Topic` from `@/lib/student/types`; existing `createClient`, RLS policy `profiles: update profil sendiri`.
- Produces: `MAX_BIO_LENGTH: number` from `@/lib/kader/types`; `updateKaderBioCore(supabase: SupabaseClient, bio: string): Promise<void>` and `updateKaderTopicsCore(supabase: SupabaseClient, topics: Topic[]): Promise<void>` from `@/lib/kader/core`; `updateKaderBio(bio: string): Promise<void>` and `updateKaderTopics(topics: Topic[]): Promise<void>` from `@/lib/kader/actions`. Task 2/3 components call the `actions.ts` versions; later tasks don't depend on this task's types.

- [ ] **Step 1: Write the failing tests**

Append to `tests/kader-actions.test.ts` (add `updateKaderBioCore, updateKaderTopicsCore` to the existing `@/lib/kader/core` import, and `MAX_BIO_LENGTH` to a new `@/lib/kader/types` import):

```typescript
import { MAX_BIO_LENGTH } from "@/lib/kader/types";
```

```typescript
describe("updateKaderBioCore", () => {
  it("trims and saves the bio for the signed-in kader", async () => {
    const { id, client } = await createSignedInTestKader();
    try {
      await updateKaderBioCore(client, "  Suka dengerin cerita orang lain.  ");
      const service = getServiceClient();
      const { data } = await service.from("profiles").select("bio").eq("id", id).single();
      expect(data?.bio).toBe("Suka dengerin cerita orang lain.");
    } finally {
      await deleteTestUser(id);
    }
  });

  it("stores an empty/whitespace-only bio as null", async () => {
    const { id, client } = await createSignedInTestKader();
    try {
      await updateKaderBioCore(client, "   ");
      const service = getServiceClient();
      const { data } = await service.from("profiles").select("bio").eq("id", id).single();
      expect(data?.bio).toBeNull();
    } finally {
      await deleteTestUser(id);
    }
  });

  it("rejects a bio longer than the max length", async () => {
    const { id, client } = await createSignedInTestKader();
    try {
      await expect(updateKaderBioCore(client, "a".repeat(MAX_BIO_LENGTH + 1))).rejects.toThrow(
        "Bio maksimal",
      );
    } finally {
      await deleteTestUser(id);
    }
  });
});

describe("updateKaderTopicsCore", () => {
  it("updates the signed-in kader's topics", async () => {
    const { id, client } = await createSignedInTestKader();
    try {
      await updateKaderTopicsCore(client, ["akademik", "keluarga"]);
      const service = getServiceClient();
      const { data } = await service.from("profiles").select("topics").eq("id", id).single();
      expect(data?.topics).toEqual(["akademik", "keluarga"]);
    } finally {
      await deleteTestUser(id);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/kader-actions.test.ts`
Expected: FAIL — `updateKaderBioCore`/`updateKaderTopicsCore` are not exported from `@/lib/kader/core`, and `MAX_BIO_LENGTH` is not exported from `@/lib/kader/types`.

- [ ] **Step 3: Implement**

Append to `src/lib/kader/types.ts`:

```typescript
export const MAX_BIO_LENGTH = 150;
```

In `src/lib/kader/core.ts`, add `MAX_BIO_LENGTH` to the existing `./types` import (`import type { KaderDashboard, ... } from "./types";` becomes a mixed value+type import — add a second import line: `import { MAX_BIO_LENGTH } from "./types";`), then append:

```typescript
export async function updateKaderBioCore(supabase: SupabaseClient, bio: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const trimmed = bio.trim();
  if (trimmed.length > MAX_BIO_LENGTH) {
    throw new Error(`Bio maksimal ${MAX_BIO_LENGTH} karakter`);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ bio: trimmed.length > 0 ? trimmed : null })
    .eq("id", user.id);

  if (error) {
    throw new Error("Gagal menyimpan bio");
  }
}

export async function updateKaderTopicsCore(supabase: SupabaseClient, topics: Topic[]): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { error } = await supabase.from("profiles").update({ topics }).eq("id", user.id);

  if (error) {
    throw new Error("Gagal memperbarui topik");
  }
}
```

In `src/lib/kader/actions.ts`, add `updateKaderBioCore, updateKaderTopicsCore` to the existing `./core` import, and add `Topic` to the existing type import (`import type { KaderStatus } from "@/lib/student/types";` becomes `import type { KaderStatus, Topic } from "@/lib/student/types";`), then append:

```typescript
export async function updateKaderBio(bio: string): Promise<void> {
  const supabase = await createClient();
  await updateKaderBioCore(supabase, bio);
  revalidatePath("/kader/profil");
}

export async function updateKaderTopics(topics: Topic[]): Promise<void> {
  const supabase = await createClient();
  await updateKaderTopicsCore(supabase, topics);
  revalidatePath("/kader/profil");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/kader-actions.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kader/types.ts src/lib/kader/core.ts src/lib/kader/actions.ts tests/kader-actions.test.ts
git commit -m "feat(kader): add bio/topics profile update actions"
```

---

### Task 2: BioEditor component

**Files:**
- Create: `src/components/kader/BioEditor.tsx`

**Interfaces:**
- Consumes: `updateKaderBio` (Task 1) from `@/lib/kader/actions`; `MAX_BIO_LENGTH` (Task 1) from `@/lib/kader/types`; `Button` from `@/components/ui/Button`.
- Produces: `BioEditor({ bio: string | null }): JSX.Element` from `@/components/kader/BioEditor`. Task 4 renders it.

- [ ] **Step 1: Implement**

Create `src/components/kader/BioEditor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { updateKaderBio } from "@/lib/kader/actions";
import { MAX_BIO_LENGTH } from "@/lib/kader/types";

export function BioEditor({ bio }: { bio: string | null }) {
  const [saved, setSaved] = useState(bio ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bio ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleEdit() {
    setDraft(saved);
    setError(null);
    setEditing(true);
  }

  function handleCancel() {
    setDraft(saved);
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateKaderBio(draft);
        setSaved(draft.trim());
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal menyimpan bio");
      }
    });
  }

  if (!editing) {
    return (
      <div>
        <p className="text-body-md text-on-surface-variant">
          {saved || "Belum ada bio. Tambahkan bio singkat agar adik kelas lebih mengenalmu."}
        </p>
        <Button variant="ghost" className="mt-3" onClick={handleEdit}>
          Edit Bio
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_BIO_LENGTH}
          rows={4}
          placeholder="Ceritakan sedikit tentang dirimu..."
          className="w-full resize-none rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
        />
        <span className="absolute bottom-2 right-2 text-label-sm text-on-surface-variant">
          {draft.length}/{MAX_BIO_LENGTH}
        </span>
      </div>
      {error && <p className="mt-2 text-label-sm text-error">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="ghost" onClick={handleCancel} disabled={pending}>
          Batal
        </Button>
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/kader/BioEditor.tsx
git commit -m "feat(kader): add BioEditor component"
```

---

### Task 3: TopicsEditor component

**Files:**
- Create: `src/components/kader/TopicsEditor.tsx`

**Interfaces:**
- Consumes: `updateKaderTopics` (Task 1) from `@/lib/kader/actions`; `TOPICS`, `TOPIC_LABELS`, `Topic` from `@/lib/student/types`; `Button`, `Chip` from `@/components/ui`.
- Produces: `TopicsEditor({ topics: Topic[] }): JSX.Element` from `@/components/kader/TopicsEditor`. Task 4 renders it.

- [ ] **Step 1: Implement**

Create `src/components/kader/TopicsEditor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { updateKaderTopics } from "@/lib/kader/actions";
import { TOPICS, TOPIC_LABELS, type Topic } from "@/lib/student/types";

export function TopicsEditor({ topics }: { topics: Topic[] }) {
  const [current, setCurrent] = useState(topics);
  const [picked, setPicked] = useState<Topic | "">("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const remaining = TOPICS.filter((topic) => !current.includes(topic));

  function save(next: Topic[]) {
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateKaderTopics(next);
      } catch (err) {
        setCurrent(previous);
        setError(err instanceof Error ? err.message : "Gagal memperbarui topik");
      }
    });
  }

  function handleRemove(topic: Topic) {
    save(current.filter((t) => t !== topic));
  }

  function handleAdd() {
    if (!picked) return;
    save([...current, picked]);
    setPicked("");
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {current.length === 0 && (
          <p className="text-body-md text-on-surface-variant">Belum ada topik dipilih.</p>
        )}
        {current.map((topic) => (
          <Chip key={topic} tone="secondary" className="gap-1">
            {TOPIC_LABELS[topic]}
            <button
              type="button"
              onClick={() => handleRemove(topic)}
              disabled={pending}
              aria-label={`Hapus topik ${TOPIC_LABELS[topic]}`}
              className="ml-1 hover:text-error"
            >
              ×
            </button>
          </Chip>
        ))}
      </div>

      {remaining.length > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value as Topic)}
            disabled={pending}
            className="rounded-md border-2 border-outline-variant bg-surface-container-low px-3 py-2 text-body-md text-on-surface outline-none"
          >
            <option value="">Pilih topik...</option>
            {remaining.map((topic) => (
              <option key={topic} value={topic}>
                {TOPIC_LABELS[topic]}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={handleAdd} disabled={!picked || pending}>
            Tambah
          </Button>
        </div>
      )}

      {error && <p className="mt-2 text-label-sm text-error">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/kader/TopicsEditor.tsx
git commit -m "feat(kader): add TopicsEditor component"
```

---

### Task 4: Wire bio/topics editors into the Profil page

**Files:**
- Modify: `src/app/kader/(protected)/profil/page.tsx`

**Interfaces:**
- Consumes: `BioEditor` (Task 2), `TopicsEditor` (Task 3).

- [ ] **Step 1: Implement**

Replace the full contents of `src/app/kader/(protected)/profil/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusToggle } from "@/components/kader/StatusToggle";
import { BioEditor } from "@/components/kader/BioEditor";
import { TopicsEditor } from "@/components/kader/TopicsEditor";
import type { KaderStatus, Topic } from "@/lib/student/types";

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
    .select("full_name, status, bio, topics")
    .eq("id", user.id)
    .single();

  const fullName = (profile?.full_name as string | null) ?? "Kader";
  const status = (profile?.status as KaderStatus | null) ?? "offline";
  const bio = (profile?.bio as string | null) ?? null;
  const topics = (profile?.topics as Topic[] | null) ?? [];
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

      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-md">
        <h2 className="mb-4 text-headline-md text-on-surface">Bio Singkat</h2>
        <BioEditor bio={bio} />
      </div>

      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-md">
        <h2 className="mb-2 text-headline-md text-on-surface">Topik Konsultasi Saya</h2>
        <p className="mb-4 text-body-md text-on-surface-variant">
          Pilih topik yang paling kamu kuasai untuk membantu adik kelas merasa lebih terhubung.
        </p>
        <TopicsEditor topics={topics} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Manual check**

Run: `npm run dev`, navigate to `/kader/profil` while logged in as a verified kader. Click "Edit Bio", type a bio, confirm the counter updates and "Simpan" persists it (reload the page to confirm it stuck). Add a topic via the dropdown + "Tambah", confirm the chip appears immediately; click its "×" to remove it, confirm it disappears immediately.

- [ ] **Step 4: Commit**

```bash
git add "src/app/kader/(protected)/profil/page.tsx"
git commit -m "feat(kader): wire bio/topics editors into Profil page"
```

---

### Task 5: Alihkan Konsultasi (transfer) — core, actions, and tests

**Files:**
- Modify: `src/lib/kader/core.ts`
- Modify: `src/lib/kader/actions.ts`
- Test: `tests/kader-actions.test.ts` (append)

**Interfaces:**
- Consumes: `KaderSummary`, `Topic` from `@/lib/student/types`; `createServiceClient` from `@/lib/supabase/service` (already imported in `core.ts`).
- Produces: `getAvailableKaderForTransferCore(supabase: SupabaseClient, sessionId: string): Promise<KaderSummary[]>` and `transferSessionCore(supabase: SupabaseClient, input: { sessionId: string; toKaderId: string }): Promise<void>` from `@/lib/kader/core`; `getAvailableKaderForTransfer(input: { sessionId: string }): Promise<KaderSummary[]>` and `transferSession(input: { sessionId: string; toKaderId: string }): Promise<void>` from `@/lib/kader/actions`. Task 7's `TransferScreen` calls the `actions.ts` versions.

- [ ] **Step 1: Write the failing tests**

Append to `tests/kader-actions.test.ts`:

```typescript
describe("getAvailableKaderForTransferCore", () => {
  it("lists other verified, available kader, excluding self, busy, and unverified kader", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const other = await createSignedInTestKader({ status: "available" });
    const busy = await createSignedInTestKader({ status: "busy" });
    const unverified = await createSignedInTestKader({ status: "available", verified: false });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));

      const result = await getAvailableKaderForTransferCore(client, sessionId);
      const ids = result.map((k) => k.id);
      expect(ids).toContain(other.id);
      expect(ids).not.toContain(id);
      expect(ids).not.toContain(busy.id);
      expect(ids).not.toContain(unverified.id);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(other.id);
      await deleteTestUser(busy.id);
      await deleteTestUser(unverified.id);
    }
  });

  it("throws for a session not assigned to this kader", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const owner = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: owner.id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(getAvailableKaderForTransferCore(client, sessionId)).rejects.toThrow(
        "Sesi tidak ditemukan",
      );
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(owner.id);
    }
  });
});

describe("transferSessionCore", () => {
  it("reassigns the session to the target kader and logs a transfer assignment", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const target = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));
      const service = getServiceClient();
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      await transferSessionCore(client, { sessionId, toKaderId: target.id });

      const { data: session } = await service
        .from("sessions")
        .select("assigned_to")
        .eq("id", sessionId)
        .single();
      expect(session?.assigned_to).toBe(target.id);

      const { data: assignment } = await service
        .from("session_assignments")
        .select("from_id, to_id, changed_by, reason")
        .eq("session_id", sessionId)
        .eq("reason", "transfer")
        .single();
      expect(assignment?.from_id).toBe(id);
      expect(assignment?.to_id).toBe(target.id);
      expect(assignment?.changed_by).toBe(id);
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(target.id);
    }
  });

  it("throws for a session id that does not belong to this kader", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const owner = await createSignedInTestKader({ status: "available" });
    const target = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: owner.id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(
        transferSessionCore(client, { sessionId, toKaderId: target.id }),
      ).rejects.toThrow("Sesi tidak ditemukan");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(owner.id);
      await deleteTestUser(target.id);
    }
  });

  it("throws when the target kader is not available", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const target = await createSignedInTestKader({ status: "busy" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));

      await expect(
        transferSessionCore(client, { sessionId, toKaderId: target.id }),
      ).rejects.toThrow("Kader ini sudah tidak tersedia");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(target.id);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/kader-actions.test.ts`
Expected: FAIL — `getAvailableKaderForTransferCore`/`transferSessionCore` are not exported from `@/lib/kader/core`.

- [ ] **Step 3: Implement**

In `src/lib/kader/core.ts`, change the existing `import type { KaderStatus, Topic } from "@/lib/student/types";` to also bring in `KaderSummary`:

```typescript
import type { KaderStatus, KaderSummary, Topic } from "@/lib/student/types";
```

Then append:

```typescript
export async function getAvailableKaderForTransferCore(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<KaderSummary[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error("Sesi tidak ditemukan");
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("id, full_name, bio, topics, status")
    .eq("role", "kader")
    .eq("is_verified", true)
    .eq("status", "available")
    .neq("id", user.id)
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error("Gagal memuat daftar kader");
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    fullName: (row.full_name as string | null) ?? "Kader",
    bio: row.bio as string | null,
    topics: (row.topics as Topic[] | null) ?? [],
    status: row.status as KaderStatus,
  }));
}

export async function transferSessionCore(
  supabase: SupabaseClient,
  input: { sessionId: string; toKaderId: string },
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("assigned_to")
    .eq("id", input.sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error("Sesi tidak ditemukan");
  }

  const service = createServiceClient();
  const { data: target, error: targetError } = await service
    .from("profiles")
    .select("role, is_verified, status")
    .eq("id", input.toKaderId)
    .single();

  if (targetError || !target) {
    throw new Error("Kader tidak ditemukan");
  }
  if (target.role !== "kader" || !target.is_verified) {
    throw new Error("Kader tidak ditemukan");
  }
  if (target.status !== "available") {
    throw new Error("Kader ini sudah tidak tersedia, silakan pilih kader lain");
  }

  const { error: assignmentError } = await supabase.from("session_assignments").insert({
    session_id: input.sessionId,
    from_id: session.assigned_to,
    to_id: input.toKaderId,
    changed_by: user.id,
    reason: "transfer",
  });

  if (assignmentError) {
    throw new Error("Gagal mencatat pengalihan");
  }

  const { data: updated, error: updateError } = await supabase
    .from("sessions")
    .update({ assigned_to: input.toKaderId })
    .eq("id", input.sessionId)
    .select("id")
    .single();

  if (updateError || !updated) {
    throw new Error("Gagal mengalihkan konsultasi");
  }
}
```

Append to `src/lib/kader/actions.ts` (add `getAvailableKaderForTransferCore, transferSessionCore` to the existing `./core` import, and `KaderSummary` to a `@/lib/student/types` type import):

```typescript
export async function getAvailableKaderForTransfer(input: { sessionId: string }): Promise<KaderSummary[]> {
  const supabase = await createClient();
  return getAvailableKaderForTransferCore(supabase, input.sessionId);
}

export async function transferSession(input: { sessionId: string; toKaderId: string }): Promise<void> {
  const supabase = await createClient();
  await transferSessionCore(supabase, input);
  revalidatePath("/kader");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/kader-actions.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kader/core.ts src/lib/kader/actions.ts tests/kader-actions.test.ts
git commit -m "feat(kader): add alihkan konsultasi (transfer) actions"
```

---

### Task 6: TransferKaderCard component

**Files:**
- Create: `src/components/kader/TransferKaderCard.tsx`

**Interfaces:**
- Consumes: `KaderSummary` from `@/lib/student/types`; `Button`, `Card`, `Chip` from `@/components/ui`.
- Produces: `TransferKaderCard({ kader: KaderSummary; onSelect: (kader: KaderSummary) => void }): JSX.Element` from `@/components/kader/TransferKaderCard`. Task 7's `TransferScreen` renders it.

- [ ] **Step 1: Implement**

Create `src/components/kader/TransferKaderCard.tsx`:

```tsx
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import type { KaderSummary } from "@/lib/student/types";

export function TransferKaderCard({
  kader,
  onSelect,
}: {
  kader: KaderSummary;
  onSelect: (kader: KaderSummary) => void;
}) {
  const initial = kader.fullName.trim().charAt(0).toUpperCase() || "K";

  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-fixed text-headline-md font-bold text-on-secondary-fixed"
        >
          {initial}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-label-md font-semibold text-on-surface">Kak {kader.fullName}</p>
            <Chip tone="primary">Tersedia</Chip>
          </div>
          {kader.bio && (
            <p className="mt-1 line-clamp-2 text-body-md text-on-surface-variant">{kader.bio}</p>
          )}
        </div>
      </div>
      <Button onClick={() => onSelect(kader)} className="shrink-0">
        Pilih &amp; Alihkan
      </Button>
    </Card>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/kader/TransferKaderCard.tsx
git commit -m "feat(kader): add TransferKaderCard component"
```

---

### Task 7: Alihkan Konsultasi screen, route, and chat-header wiring

**Files:**
- Create: `src/components/kader/TransferScreen.tsx`
- Create: `src/app/kader/(protected)/alihkan/[sessionId]/page.tsx`
- Modify: `src/components/kader/ChatScreen.tsx`

**Interfaces:**
- Consumes: `getAvailableKaderForTransfer`, `transferSession` (Task 5), `getSessionStudentInfo` (Phase 1) from `@/lib/kader/actions`; `TransferKaderCard` (Task 6); `Modal` from `@/components/ui/Modal`.

- [ ] **Step 1: Implement TransferScreen**

Create `src/components/kader/TransferScreen.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TransferKaderCard } from "./TransferKaderCard";
import { getAvailableKaderForTransfer, getSessionStudentInfo, transferSession } from "@/lib/kader/actions";
import type { KaderSummary } from "@/lib/student/types";

export function TransferScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [studentName, setStudentName] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<KaderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<KaderSummary | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSessionStudentInfo({ sessionId }), getAvailableKaderForTransfer({ sessionId })])
      .then(([info, list]) => {
        setStudentName(info.displayName);
        setCandidates(list);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Gagal memuat daftar kader"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  async function handleConfirm() {
    if (!selected) return;
    setTransferring(true);
    setActionError(null);
    try {
      await transferSession({ sessionId, toKaderId: selected.id });
      router.push("/kader");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal mengalihkan konsultasi");
      setTransferring(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" onClick={() => router.back()}>
          ← Kembali
        </Button>
        <h1 className="mt-2 text-headline-lg-mobile font-bold text-on-background md:text-headline-lg">
          Alihkan Konsultasi
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Pilih Kader yang tersedia untuk mengambil alih sesi konsultasi {studentName ?? "siswa ini"}.
        </p>
      </div>

      {loadError && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {loadError}
        </p>
      )}

      {actionError && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {actionError}
        </p>
      )}

      {loading && <p className="text-body-md text-on-surface-variant">Memuat daftar kader...</p>}

      {!loading && !loadError && candidates.length === 0 && (
        <p className="text-body-md text-on-surface-variant">
          Tidak ada kader lain yang sedang tersedia saat ini.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {candidates.map((kader) => (
          <TransferKaderCard key={kader.id} kader={kader} onSelect={setSelected} />
        ))}
      </div>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Konfirmasi Pengalihan"
        description={
          selected
            ? `Yakin ingin mengalihkan konsultasi ${studentName ?? "siswa ini"} ke Kak ${selected.fullName}?`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={transferring}>
              Batal
            </Button>
            <Button onClick={handleConfirm} disabled={transferring}>
              {transferring ? "Mengalihkan..." : "Ya, Alihkan"}
            </Button>
          </>
        }
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

Create `src/app/kader/(protected)/alihkan/[sessionId]/page.tsx`:

```tsx
import { TransferScreen } from "@/components/kader/TransferScreen";

export default async function KaderAlihkanPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <TransferScreen sessionId={sessionId} />;
}
```

This route lives under `(protected)`, so `src/app/kader/(protected)/layout.tsx` already gates it (login + role + verification) before `TransferScreen` renders — no separate auth check needed here (unlike `src/app/kader/chat/[sessionId]/page.tsx`, which lives outside that route group and duplicates the gate).

- [ ] **Step 3: Wire the "Alihkan" button in ChatScreen**

In `src/components/kader/ChatScreen.tsx`, replace:

```tsx
          <Button variant="ghost" disabled title="Segera hadir">
            Alihkan
          </Button>
```

with:

```tsx
          <Button
            variant="ghost"
            onClick={() => router.push(`/kader/alihkan/${sessionId}`)}
            disabled={studentInfo?.status === "ended"}
          >
            Alihkan
          </Button>
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Manual check**

Run: `npm run dev`. As a verified kader with an active session assigned, open its chat, click "Alihkan" — confirm it navigates to `/kader/alihkan/<id>`, shows other available kader (seed a second verified/available kader via the Supabase dashboard if none exist), and that confirming the modal reassigns the session and redirects to `/kader` (the transferred session should disappear from this kader's Beranda).

- [ ] **Step 6: Commit**

```bash
git add src/components/kader/TransferScreen.tsx "src/app/kader/(protected)/alihkan/[sessionId]/page.tsx" src/components/kader/ChatScreen.tsx
git commit -m "feat(kader): add Alihkan Konsultasi screen and route"
```

---

### Task 8: Eskalasi ke Guru/BK — core, action, and tests

**Files:**
- Modify: `src/lib/kader/core.ts`
- Modify: `src/lib/kader/actions.ts`
- Test: `tests/kader-actions.test.ts` (append)

**Interfaces:**
- Consumes: RLS policy `escalations: kader buat di sesi sendiri` (enforces `kader_id = auth.uid()` and session ownership — no manual check needed in core, matching this plan's Global Constraints).
- Produces: `escalateSessionCore(supabase: SupabaseClient, input: { sessionId: string; reason: string | null }): Promise<void>` from `@/lib/kader/core`; `escalateSession(input: { sessionId: string; reason: string | null }): Promise<void>` from `@/lib/kader/actions`. Task 9's `EscalationModal` calls the `actions.ts` version.

- [ ] **Step 1: Write the failing tests**

Append to `tests/kader-actions.test.ts`:

```typescript
describe("escalateSessionCore", () => {
  it("inserts a pending escalation and flips the session status to escalated", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));
      const service = getServiceClient();
      await service.from("sessions").update({ status: "active" }).eq("id", sessionId);

      await escalateSessionCore(client, { sessionId, reason: "Butuh bantuan guru" });

      const { data: escalation } = await service
        .from("escalations")
        .select("kader_id, reason, status")
        .eq("session_id", sessionId)
        .single();
      expect(escalation?.kader_id).toBe(id);
      expect(escalation?.reason).toBe("Butuh bantuan guru");
      expect(escalation?.status).toBe("pending");

      const { data: session } = await service.from("sessions").select("status").eq("id", sessionId).single();
      expect(session?.status).toBe("escalated");
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
    }
  });

  it("allows a null reason", async () => {
    const { id, client } = await createSignedInTestKader({ status: "available" });
    const cleanup: Array<() => Promise<void>> = [];
    try {
      const localId = await createTestStudentIdentity();
      cleanup.push(() => deleteTestStudentIdentity(localId));
      const sessionId = await createTestSession({ studentLocalId: localId, assignedTo: id });
      cleanup.push(() => deleteTestSession(sessionId));

      await escalateSessionCore(client, { sessionId, reason: null });

      const service = getServiceClient();
      const { data: escalation } = await service
        .from("escalations")
        .select("reason")
        .eq("session_id", sessionId)
        .single();
      expect(escalation?.reason).toBeNull();
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

      await expect(escalateSessionCore(client, { sessionId, reason: null })).rejects.toThrow(
        "Gagal mengirim eskalasi",
      );
    } finally {
      for (const fn of cleanup.reverse()) await fn();
      await deleteTestUser(id);
      await deleteTestUser(owner.id);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/kader-actions.test.ts`
Expected: FAIL — `escalateSessionCore` is not exported from `@/lib/kader/core`.

- [ ] **Step 3: Implement**

Append to `src/lib/kader/core.ts`:

```typescript
export async function escalateSessionCore(
  supabase: SupabaseClient,
  input: { sessionId: string; reason: string | null },
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { error } = await supabase.from("escalations").insert({
    session_id: input.sessionId,
    kader_id: user.id,
    reason: input.reason,
  });

  if (error) {
    throw new Error("Gagal mengirim eskalasi, coba lagi");
  }
}
```

Append to `src/lib/kader/actions.ts` (add `escalateSessionCore` to the existing `./core` import):

```typescript
export async function escalateSession(input: { sessionId: string; reason: string | null }): Promise<void> {
  const supabase = await createClient();
  await escalateSessionCore(supabase, input);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/kader-actions.test.ts`
Expected: PASS (all tests, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kader/core.ts src/lib/kader/actions.ts tests/kader-actions.test.ts
git commit -m "feat(kader): add escalation action"
```

---

### Task 9: EscalationModal and "Hubungi Guru/BK" wiring

**Files:**
- Create: `src/components/kader/EscalationModal.tsx`
- Modify: `src/components/kader/ChatScreen.tsx`

**Interfaces:**
- Consumes: `escalateSession` (Task 8) from `@/lib/kader/actions`; `Modal` from `@/components/ui/Modal`.
- Produces: `EscalationModal({ sessionId: string; open: boolean; onClose: () => void; onEscalated: () => void }): JSX.Element` from `@/components/kader/EscalationModal`.

- [ ] **Step 1: Implement EscalationModal**

Create `src/components/kader/EscalationModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { escalateSession } from "@/lib/kader/actions";

export function EscalationModal({
  sessionId,
  open,
  onClose,
  onEscalated,
}: {
  sessionId: string;
  open: boolean;
  onClose: () => void;
  onEscalated: () => void;
}) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSending(true);
    setError(null);
    try {
      await escalateSession({ sessionId, reason: reason.trim() || null });
      setReason("");
      onEscalated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim eskalasi, coba lagi");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Hubungi Guru/BK"
      description="Gunakan fitur ini jika kamu merasa kasus ini membutuhkan bantuan profesional dari guru atau konselor sekolah. Privasi tetap dijaga."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={sending}>
            {sending ? "Mengirim..." : "Kirim ke Guru/BK"}
          </Button>
        </>
      }
    >
      <div className="text-left">
        <label htmlFor="escalation-reason" className="mb-2 block text-label-md text-on-surface-variant">
          Alasan Eskalasi (Opsional)
        </label>
        <textarea
          id="escalation-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Tuliskan alasan eskalasi di sini..."
          rows={4}
          className="w-full resize-none rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
        />
        {error && <p className="mt-2 text-label-sm text-error">{error}</p>}
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Wire it into ChatScreen**

In `src/components/kader/ChatScreen.tsx`, add to the imports:

```tsx
import { EscalationModal } from "@/components/kader/EscalationModal";
```

Add new state alongside the existing `const [ending, setEnding] = useState(false);`:

```tsx
  const [escalationOpen, setEscalationOpen] = useState(false);
  const [escalationNotice, setEscalationNotice] = useState<string | null>(null);
```

Add a handler alongside `handleEnd`:

```tsx
  function handleEscalated() {
    setEscalationOpen(false);
    setEscalationNotice("Eskalasi terkirim ke Guru/BK.");
    getSessionStudentInfo({ sessionId })
      .then(setStudentInfo)
      .catch(() => {
        // Non-fatal: the notice above already confirms the escalation went through.
      });
  }
```

Replace:

```tsx
          <Button variant="ghost" disabled title="Segera hadir">
            Hubungi Guru/BK
          </Button>
```

with:

```tsx
          <Button
            variant="ghost"
            onClick={() => setEscalationOpen(true)}
            disabled={studentInfo?.status === "ended" || studentInfo?.status === "escalated"}
          >
            {studentInfo?.status === "escalated" ? "Sudah Dieskalasi" : "Hubungi Guru/BK"}
          </Button>
```

Add the notice banner right after the existing "monitored by guru" banner (`ℹ️ Sesi ini dipantau oleh guru/BK demi keamanan.`):

```tsx
      {escalationNotice && (
        <div className="border-b border-outline-variant bg-secondary-container px-sm py-2 text-label-sm text-on-secondary-container">
          ✅ {escalationNotice}
        </div>
      )}
```

Add the modal itself right before the closing `</main>` tag:

```tsx
      <EscalationModal
        sessionId={sessionId}
        open={escalationOpen}
        onClose={() => setEscalationOpen(false)}
        onEscalated={handleEscalated}
      />
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Manual check**

Run: `npm run dev`. As a verified kader in an active chat, click "Hubungi Guru/BK", type an optional reason, click "Kirim ke Guru/BK" — confirm the modal closes, a "Eskalasi terkirim ke Guru/BK." notice appears, and the button now reads "Sudah Dieskalasi" and is disabled. Log in as a guru and confirm the session shows up in the guru dashboard's "Butuh Perhatian" panel (existing guru-side behavior, unchanged by this plan).

- [ ] **Step 5: Commit**

```bash
git add src/components/kader/EscalationModal.tsx src/components/kader/ChatScreen.tsx
git commit -m "feat(kader): add escalation modal and wire Hubungi Guru/BK"
```

---

### Task 10: Full regression pass and manual walkthrough

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: PASS — `tests/schema.test.ts`, `tests/chat.test.ts`, `tests/student-actions.test.ts`, `tests/student-types.test.ts`, `tests/kader-actions.test.ts`, `tests/guru-actions.test.ts` all green.

- [ ] **Step 2: Type-check and lint the whole project**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual end-to-end walkthrough**

Run: `npm run dev`. As a verified kader with an active session:

1. Visit `/kader/profil`, edit the bio and save, confirm it persists after a reload. Add and remove a topic, confirm both update immediately and persist after a reload.
2. Open the session's chat, click "Alihkan", pick another available kader (seed one via the Supabase dashboard if needed), confirm the transfer, confirm you land back on `/kader` and the session is gone from your active list.
3. As the kader the session was transferred to, confirm it now appears in *their* `/kader` active list and chat.
4. Open a different active session's chat, click "Hubungi Guru/BK", submit with a reason, confirm the notice banner and the button's disabled "Sudah Dieskalasi" state.
5. Log in as a guru, confirm the escalated session appears in the Beranda "Butuh Perhatian" panel and in Daftar Konsultasi with an "escalated" status chip (pre-existing guru-side behavior).

- [ ] **Step 4: Confirm no unrelated regressions**

Log in as a guru and as a student (existing flows) and confirm both still work — this plan only touches `src/lib/kader/`, `src/components/kader/`, and `src/app/kader/`, but re-run the student welcome → topik → kader → konfirmasi → chat flow once as a sanity check since `listAvailableKader`'s `KaderSummary` type is now also consumed by the new transfer flow.
