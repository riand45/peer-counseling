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
