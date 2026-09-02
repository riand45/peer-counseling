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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<SessionStatus | "all">("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ConsultationListResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      clearTimeout(timeout);
    };
  }, [search]);

  useEffect(() => {
    let active = true;
    listConsultations({
      status: status === "all" ? undefined : status,
      search: debouncedSearch,
      page,
      includeArchived,
    })
      .then((data) => {
        if (active) {
          setResult(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Gagal memuat daftar konsultasi");
      });
    return () => {
      active = false;
    };
  }, [debouncedSearch, status, page, includeArchived]);

  function handleStatusChange(next: SessionStatus | "all") {
    setStatus(next);
    setPage(1);
  }

  function handleIncludeArchivedChange(next: boolean) {
    setIncludeArchived(next);
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
          className="w-full rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest md:max-w-[24rem]"
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
        <label className="flex items-center gap-2 text-label-md text-on-surface-variant">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => handleIncludeArchivedChange(e.target.checked)}
            className="h-4 w-4 rounded border-outline-variant"
          />
          Tampilkan yang diarsipkan
        </label>
      </div>

      {error && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      {!result && !error ? (
        <div className="overflow-x-auto animate-pulse" aria-busy="true" aria-label="Memuat daftar konsultasi">
          <table className="w-full min-w-[760px] text-left text-body-md">
            <thead>
              <tr className="border-b border-outline-variant">
                {["ID", "Siswa", "Topik", "Konselor", "Status", "Tanggal", "Aksi"].map((col) => (
                  <th key={col} className="py-2 pr-3">
                    <div className="h-3 w-16 rounded-full bg-surface-container-high" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4].map((row) => (
                <tr key={row} className="border-b border-outline-variant">
                  <td className="py-3 pr-3"><div className="h-3 w-14 rounded-full bg-surface-container-high" /></td>
                  <td className="py-3 pr-3"><div className="h-3 w-24 rounded-full bg-surface-container-high" /></td>
                  <td className="py-3 pr-3"><div className="h-3 w-20 rounded-full bg-surface-container-high" /></td>
                  <td className="py-3 pr-3"><div className="h-3 w-24 rounded-full bg-surface-container-high" /></td>
                  <td className="py-3 pr-3"><div className="h-5 w-16 rounded-full bg-surface-container-high" /></td>
                  <td className="py-3 pr-3"><div className="h-3 w-20 rounded-full bg-surface-container-high" /></td>
                  <td className="py-3 pr-3"><div className="h-8 w-16 rounded-md bg-surface-container-high" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        result && <ConsultationTable result={result} onPageChange={setPage} />
      )}

    </div>
  );
}
