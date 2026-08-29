import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { TOPIC_LABELS } from "@/lib/student/types";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/guru/types";
import type { ActivityItem } from "@/lib/guru/types";

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "-";
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return "Baru saja";
  if (diffMinutes < 60) return `${diffMinutes} mnt lalu`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} hari lalu`;
}

export function ActivityTable({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-body-md text-on-surface-variant">Belum ada aktivitas konsultasi.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-body-md">
        <thead>
          <tr className="border-b border-outline-variant text-label-sm text-on-surface-variant">
            <th className="py-2 pr-3 font-medium">Anonim</th>
            <th className="py-2 pr-3 font-medium">Topik</th>
            <th className="py-2 pr-3 font-medium">Kader</th>
            <th className="py-2 pr-3 font-medium">Status</th>
            <th className="py-2 pr-3 font-medium">Terakhir Aktif</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.sessionId} className="border-b border-outline-variant last:border-0">
              <td className="py-3 pr-3">
                <Link href={`/guru/konsultasi/${item.sessionId}`} className="font-semibold text-primary">
                  {item.studentDisplayName}
                </Link>
              </td>
              <td className="py-3 pr-3">{item.topics[0] ? TOPIC_LABELS[item.topics[0]] : "-"}</td>
              <td className="py-3 pr-3">{item.assignedKaderName ?? "- Belum Ditugaskan -"}</td>
              <td className="py-3 pr-3">
                <Chip tone={SESSION_STATUS_TONES[item.status]}>{SESSION_STATUS_LABELS[item.status]}</Chip>
              </td>
              <td className="py-3 pr-3 text-on-surface-variant">{formatRelativeTime(item.lastMessageAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
