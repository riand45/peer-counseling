import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import type { AttentionItem } from "@/lib/guru/types";

function formatRelativeTime(iso: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return "Baru saja";
  if (diffMinutes < 60) return `${diffMinutes} mnt lalu`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} hari lalu`;
}

export function AttentionPanel({ items }: { items: AttentionItem[] }) {
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-headline-md text-on-surface">⚠️ Butuh Perhatian</h2>
        <Chip tone="error">{items.length} Kasus</Chip>
      </div>
      {items.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">Tidak ada kasus yang butuh perhatian saat ini.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={`${item.kind}-${item.sessionId}-${item.createdAt}`}>
              <Link
                href={`/guru/konsultasi/${item.sessionId}`}
                className="block rounded-md border-l-4 border-error bg-error-container/40 p-3 transition-colors hover:bg-error-container/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-label-md font-semibold text-on-surface">{item.studentDisplayName}</p>
                  <Chip tone="error">{item.kind === "escalation" ? "Eskalasi" : "Laporan User"}</Chip>
                </div>
                <p className="mt-1 line-clamp-2 text-body-md text-on-surface-variant">{item.detail}</p>
                <p className="mt-1 text-label-sm text-on-surface-variant">
                  🕐 {formatRelativeTime(item.createdAt)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
