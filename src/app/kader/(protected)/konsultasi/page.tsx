"use client";

import { useEffect, useState } from "react";
import { getKaderDashboard } from "@/lib/kader/actions";
import type { KaderDashboard } from "@/lib/kader/types";
import { SessionCard } from "@/components/kader/SessionCard";

export default function KaderKonsultasiPage() {
  const [dashboard, setDashboard] = useState<KaderDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getKaderDashboard()
      .then(setDashboard)
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat konsultasi"));
  }, []);

  if (error) {
    return (
      <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
        {error}
      </p>
    );
  }

  if (!dashboard) {
    return <p className="text-body-md text-on-surface-variant">Memuat daftar konsultasi...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-md font-sans">
          Daftar Konsultasi
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Semua sesi aktif yang sedang Anda tangani saat ini.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {dashboard.activeSessions.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-lg border border-dashed border-outline-variant py-16 text-center bg-surface-container-lowest">
            <p className="max-w-[24rem] text-body-md text-on-surface-variant">
              Belum ada konsultasi aktif. Semua teman cerita yang Anda terima akan muncul di sini.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {dashboard.activeSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
