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
    return (
      <div className="flex flex-col gap-4 animate-pulse" aria-busy="true" aria-label="Memuat riwayat cerita">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-outline-variant border-r-4 border-r-surface-container-high bg-surface-container-lowest p-sm">
            <div className="h-10 w-10 shrink-0 rounded-full bg-surface-container-high" />
            <div className="flex flex-col gap-2 flex-1">
              <div className="h-4 w-40 rounded-full bg-surface-container-high" />
              <div className="h-3 w-28 rounded-full bg-surface-container-high" />
            </div>
            <div className="h-3 w-10 rounded-full bg-surface-container-high shrink-0" />
          </div>
        ))}
      </div>
    );
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
        placeholder="Cari nama Kader..."
        aria-label="Cari percakapan"
        className="rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
      />

      {sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-outline-variant py-16 text-center">
          <p className="max-w-[24rem] text-body-md text-on-surface-variant">
            Belum ada cerita. Kalau ada sesuatu yang ingin kamu sampaikan, kamu bisa mulai kapan saja.
          </p>
          <Link href="/student/topik" className={NEW_STORY_LINK_CLASSES}>
            Mulai Cerita Baru
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">Tidak ada percakapan yang cocok dengan pencarianmu.</p>
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
