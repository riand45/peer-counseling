"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { getGuruStatistics } from "@/lib/guru/actions";
import { SESSION_STATUS_LABELS } from "@/lib/guru/types";
import { TOPIC_LABELS } from "@/lib/student/types";
import type { GuruStatistics, StatisticsRangeDays } from "@/lib/guru/types";
import { StatCard } from "./StatCard";
import { TrendChart } from "./TrendChart";
import { StatusDonutChart } from "./StatusDonutChart";
import { TopicBarChart } from "./TopicBarChart";

const RANGE_OPTIONS: { value: StatisticsRangeDays; label: string }[] = [
  { value: 7, label: "7 Hari Terakhir" },
  { value: 30, label: "30 Hari Terakhir" },
  { value: 90, label: "90 Hari Terakhir" },
];

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "-";
  return `${Math.round(minutes)}m`;
}

function toCsv(stats: GuruStatistics): string {
  const lines: string[] = [];
  lines.push("Ringkasan");
  lines.push("Metrik,Nilai");
  lines.push(`Total Sesi Chat,${stats.totalSessions}`);
  lines.push(`Siswa Aktif,${stats.activeStudents}`);
  lines.push(`Rata-rata Durasi (menit),${stats.avgDurationMinutes ?? ""}`);
  lines.push(`Kasus Eskalasi,${stats.escalationCount}`);
  lines.push("");
  lines.push("Tren Konsultasi");
  lines.push("Tanggal,Jumlah Sesi");
  for (const point of stats.trend) lines.push(`${point.date},${point.count}`);
  lines.push("");
  lines.push("Status Konsultasi");
  lines.push("Status,Jumlah");
  for (const entry of stats.statusDistribution) {
    lines.push(`${SESSION_STATUS_LABELS[entry.status]},${entry.count}`);
  }
  lines.push("");
  lines.push("Konsultasi Berdasarkan Topik");
  lines.push("Topik,Jumlah");
  for (const entry of stats.topicDistribution) {
    lines.push(`${TOPIC_LABELS[entry.topic]},${entry.count}`);
  }
  return lines.join("\n");
}

function downloadCsv(stats: GuruStatistics, rangeDays: StatisticsRangeDays) {
  const blob = new Blob([toCsv(stats)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `statistik-guru-${rangeDays}hari.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function StatisticsScreen() {
  const [rangeDays, setRangeDays] = useState<StatisticsRangeDays>(30);
  const [stats, setStats] = useState<GuruStatistics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getGuruStatistics(rangeDays)
      .then((data) => {
        if (active) {
          setStats(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Gagal memuat statistik");
      });
    return () => {
      active = false;
    };
  }, [rangeDays]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
            Statistik & Analitik
          </h1>
          <p className="mt-1 text-body-md text-on-surface-variant">Ringkasan data konsultasi siswa.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value) as StatisticsRangeDays)}
            className="rounded-md border-2 border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-body-md text-on-surface outline-none"
          >
            {RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button variant="secondary" onClick={() => stats && downloadCsv(stats, rangeDays)} disabled={!stats}>
            ⬇ Ekspor
          </Button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      {!stats && !error ? (
        <p className="text-body-md text-on-surface-variant">Memuat statistik...</p>
      ) : (
        stats && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard icon="💬" label="Total Sesi Chat" value={stats.totalSessions} />
              <StatCard icon="🧑‍🤝‍🧑" label="Siswa Aktif" value={stats.activeStudents} />
              <StatCard
                icon="⏱️"
                label="Rata-rata Durasi"
                value={formatDuration(stats.avgDurationMinutes)}
                caption="/ sesi"
              />
              <StatCard icon="⚠️" label="Kasus Eskalasi" value={stats.escalationCount} caption="Butuh perhatian" />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_minmax(0,320px)]">
              <TrendChart trend={stats.trend} />
              <StatusDonutChart distribution={stats.statusDistribution} />
            </div>

            <TopicBarChart distribution={stats.topicDistribution} />
          </>
        )
      )}
    </div>
  );
}
