import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { TOPIC_LABELS } from "@/lib/student/types";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/guru/types";
import type { ConsultationListItem, ConsultationListResult } from "@/lib/guru/types";

const ACTION_LABELS: Record<ConsultationListItem["status"], string> = {
  waiting: "Tinjau",
  active: "Pantau",
  escalated: "Tinjau",
  ended: "Riwayat",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConsultationTable({
  result,
  onPageChange,
}: {
  result: ConsultationListResult;
  onPageChange: (page: number) => void;
}) {
  const { items, total, page, pageSize } = result;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const hasPrev = page > 1;
  const hasNext = end < total;

  if (items.length === 0) {
    return <p className="text-body-md text-on-surface-variant">Tidak ada sesi konsultasi yang cocok.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-body-md">
          <thead>
            <tr className="border-b border-outline-variant text-label-sm text-on-surface-variant">
              <th className="py-2 pr-3 font-medium">ID Sesi</th>
              <th className="py-2 pr-3 font-medium">Siswa (Anonim)</th>
              <th className="py-2 pr-3 font-medium">Topik</th>
              <th className="py-2 pr-3 font-medium">Kader Bertugas</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Tanggal</th>
              <th className="py-2 pr-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sessionId} className="border-b border-outline-variant last:border-0">
                <td className="py-3 pr-3 font-mono text-label-sm text-primary">
                  #{item.sessionId.slice(0, 8)}
                </td>
                <td className="py-3 pr-3 font-semibold text-on-surface">{item.studentDisplayName}</td>
                <td className="py-3 pr-3">{item.topics[0] ? TOPIC_LABELS[item.topics[0]] : "-"}</td>
                <td className="py-3 pr-3">{item.assignedKaderName ?? "- Belum Ditugaskan -"}</td>
                <td className="py-3 pr-3">
                  <Chip tone={SESSION_STATUS_TONES[item.status]}>{SESSION_STATUS_LABELS[item.status]}</Chip>
                </td>
                <td className="py-3 pr-3 text-on-surface-variant">{formatDate(item.createdAt)}</td>
                <td className="py-3 pr-3">
                  <Link
                    href={`/guru/konsultasi/${item.sessionId}`}
                    className="inline-flex items-center justify-center rounded-md border border-outline-variant px-4 py-2 text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-variant"
                  >
                    {ACTION_LABELS[item.status]}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-label-sm text-on-surface-variant">
        <p>
          Menampilkan {start}-{end} dari {total} Sesi
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" disabled={!hasPrev} onClick={() => onPageChange(page - 1)}>
            ←
          </Button>
          <Button variant="ghost" disabled={!hasNext} onClick={() => onPageChange(page + 1)}>
            →
          </Button>
        </div>
      </div>
    </div>
  );
}
