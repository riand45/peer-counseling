"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getGuruDashboard } from "@/lib/guru/actions";
import type { GuruDashboard } from "@/lib/guru/types";
import { StatCard } from "./StatCard";
import { AttentionPanel } from "./AttentionPanel";
import { ActivityTable } from "./ActivityTable";

export function DashboardScreen() {
  const [dashboard, setDashboard] = useState<GuruDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getGuruDashboard()
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
    return (
      <div className="flex flex-col gap-6 animate-pulse" aria-busy="true" aria-label="Memuat dashboard">
        {/* Title */}
        <div className="flex flex-col gap-2">
          <div className="h-7 w-52 rounded-full bg-surface-container-high" />
          <div className="h-4 w-72 rounded-full bg-surface-container-high" />
        </div>
        {/* 4 stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4">
              <div className="h-8 w-8 rounded-full bg-surface-container-high" />
              <div className="h-7 w-12 rounded-full bg-surface-container-high" />
              <div className="h-3 w-28 rounded-full bg-surface-container-high" />
            </div>
          ))}
        </div>
        {/* Two panels */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
          <div className="h-48 rounded-2xl bg-surface-container-high" />
          <div className="h-48 rounded-2xl bg-surface-container-high" />
        </div>
      </div>
    );
  }


  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
          Dashboard Guru/BK
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Selamat datang, Pak/Bu {dashboard.fullName}. Berikut ringkasan hari ini.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon="💬" label="Total Konsultasi" value={dashboard.counts.total} />
        <StatCard icon="🔄" label="Sedang Berlangsung" value={dashboard.counts.active} />
        <StatCard icon="⏳" label="Menunggu" value={dashboard.counts.waiting} />
        <StatCard icon="✅" label="Selesai" value={dashboard.counts.ended} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,360px)_1fr]">
        <AttentionPanel items={dashboard.attention} />
        <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-md">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-headline-md text-on-surface">Aktivitas Terbaru</h2>
            <Link href="/guru/konsultasi" className="text-label-md font-semibold text-primary">
              Lihat Semua
            </Link>
          </div>
          <ActivityTable items={dashboard.activity} />
        </div>
      </div>
    </div>
  );
}
