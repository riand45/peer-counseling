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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deferring a client-only localStorage read to avoid a server/client hydration mismatch; not a cascading-render risk (fires once per mount)
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
