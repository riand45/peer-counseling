"use client";

import { useEffect, useState } from "react";
import { getKaderDashboard } from "@/lib/kader/actions";
import type { KaderDashboard } from "@/lib/kader/types";
import { SessionCard } from "@/components/kader/SessionCard";

type Tab = "aktif" | "riwayat";

export default function KaderKonsultasiPage() {
  const [dashboard, setDashboard] = useState<KaderDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("aktif");

  useEffect(() => {
    getKaderDashboard()
      .then(setDashboard)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Gagal memuat konsultasi")
      );
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
      <p className="text-body-md text-on-surface-variant">
        Memuat daftar konsultasi...
      </p>
    );
  }

  const activeSessions = dashboard.activeSessions;
  const historySessions = dashboard.historySessions;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-md font-sans">
          Daftar Konsultasi
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Kelola sesi aktif dan lihat riwayat konsultasi yang telah selesai.
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="relative flex gap-1 rounded-xl bg-surface-container-low p-1">
        {/* Sliding indicator */}
        <div
          className={`absolute top-1 bottom-1 rounded-lg bg-surface-container-highest shadow-xs transition-all duration-300 ease-out ${
            activeTab === "aktif"
              ? "left-1 right-[calc(50%+0.25rem)]"
              : "left-[calc(50%+0.25rem)] right-1"
          }`}
          aria-hidden="true"
        />
        <button
          type="button"
          id="tab-aktif"
          role="tab"
          aria-selected={activeTab === "aktif"}
          aria-controls="tabpanel-aktif"
          onClick={() => setActiveTab("aktif")}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-label-md font-semibold transition-colors duration-200 ${
            activeTab === "aktif"
              ? "text-on-surface"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span>💬</span>
          <span>Sesi Aktif</span>
          {activeSessions.length > 0 && (
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-label-xs font-bold transition-colors duration-200 ${
                activeTab === "aktif"
                  ? "bg-primary text-on-primary"
                  : "bg-outline-variant text-on-surface-variant"
              }`}
            >
              {activeSessions.length}
            </span>
          )}
        </button>

        <button
          type="button"
          id="tab-riwayat"
          role="tab"
          aria-selected={activeTab === "riwayat"}
          aria-controls="tabpanel-riwayat"
          onClick={() => setActiveTab("riwayat")}
          className={`relative z-10 flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-label-md font-semibold transition-colors duration-200 ${
            activeTab === "riwayat"
              ? "text-on-surface"
              : "text-on-surface-variant hover:text-on-surface"
          }`}
        >
          <span>📋</span>
          <span>Riwayat</span>
          {historySessions.length > 0 && (
            <span
              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-label-xs font-bold transition-colors duration-200 ${
                activeTab === "riwayat"
                  ? "bg-primary text-on-primary"
                  : "bg-outline-variant text-on-surface-variant"
              }`}
            >
              {historySessions.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      <div
        id="tabpanel-aktif"
        role="tabpanel"
        aria-labelledby="tab-aktif"
        hidden={activeTab !== "aktif"}
      >
        {activeTab === "aktif" && (
          <div className="flex flex-col gap-4 animate-fade-in">
            {activeSessions.length === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant py-16 text-center bg-surface-container-lowest">
                <span className="text-4xl">💬</span>
                <p className="max-w-[24rem] text-body-md text-on-surface-variant">
                  Belum ada konsultasi aktif. Semua teman cerita yang Anda
                  terima akan muncul di sini.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {activeSessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div
        id="tabpanel-riwayat"
        role="tabpanel"
        aria-labelledby="tab-riwayat"
        hidden={activeTab !== "riwayat"}
      >
        {activeTab === "riwayat" && (
          <div className="flex flex-col gap-4 animate-fade-in">
            {historySessions.length === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-outline-variant py-16 text-center bg-surface-container-lowest">
                <span className="text-4xl">📋</span>
                <p className="max-w-[24rem] text-body-md text-on-surface-variant">
                  Belum ada riwayat konsultasi. Sesi yang telah selesai atau
                  dieskalasi akan muncul di sini.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {historySessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
