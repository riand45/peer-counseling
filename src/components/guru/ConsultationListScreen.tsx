"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { listConsultations } from "@/lib/guru/actions";
import type { SessionStatus } from "@/lib/kader/types";
import type { ConsultationListResult } from "@/lib/guru/types";
import { ConsultationTable } from "./ConsultationTable";

const STATUS_TABS: { value: SessionStatus | "all"; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "waiting", label: "Menunggu" },
  { value: "active", label: "Berlangsung" },
  { value: "ended", label: "Selesai" },
];

export function ConsultationListScreen() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SessionStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ConsultationListResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listConsultations({ status: status === "all" ? undefined : status, search, page })
      .then((data) => {
        if (active) setResult(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Gagal memuat daftar konsultasi");
      });
    return () => {
      active = false;
    };
  }, [search, status, page]);

  function handleStatusChange(next: SessionStatus | "all") {
    setStatus(next);
    setPage(1);
  }

  function handleSearchChange(next: string) {
    setSearch(next);
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
          Manajemen Konsultasi
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Pantau dan kelola seluruh sesi konsultasi siswa.
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-md md:flex-row md:items-center md:justify-between">
        <input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Cari ID Sesi atau Nama Samaran..."
          className="w-full rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest md:max-w-sm"
        />
        <div className="inline-flex flex-wrap gap-1 rounded-full border border-outline-variant bg-surface-container-low p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleStatusChange(tab.value)}
              className={cn(
                "rounded-full px-4 py-2 text-label-md font-semibold transition-colors",
                status === tab.value
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-variant",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      {!result && !error ? (
        <p className="text-body-md text-on-surface-variant">Memuat daftar konsultasi...</p>
      ) : (
        result && <ConsultationTable result={result} onPageChange={setPage} />
      )}
    </div>
  );
}
