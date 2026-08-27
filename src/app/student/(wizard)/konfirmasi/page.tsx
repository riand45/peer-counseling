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
