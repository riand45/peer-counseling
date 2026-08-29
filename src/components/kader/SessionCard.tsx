import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { TOPIC_EMOJI, TOPIC_LABELS } from "@/lib/student/types";
import type { KaderDashboardSession } from "@/lib/kader/types";

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function SessionCard({ session }: { session: KaderDashboardSession }) {
  const initial = session.studentDisplayName.trim().charAt(0).toUpperCase() || "A";
  const primaryTopic = session.topics[0];

  return (
    <Link href={`/kader/chat/${session.id}`}>
      <Card className="flex flex-col gap-2 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-fixed text-label-md font-bold text-on-secondary-fixed"
            >
              {initial}
            </div>
            <div>
              <p className="text-label-md font-semibold text-on-surface">{session.studentDisplayName}</p>
              {primaryTopic && (
                <Chip tone="secondary" className="mt-1">
                  {TOPIC_EMOJI[primaryTopic]} {TOPIC_LABELS[primaryTopic]}
                </Chip>
              )}
            </div>
          </div>
          <span className="whitespace-nowrap text-label-sm text-on-surface-variant">
            {formatTime(session.lastMessageAt)}
          </span>
        </div>
        {session.lastMessagePreview && (
          <p className="truncate text-body-md text-on-surface-variant">{session.lastMessagePreview}</p>
        )}
      </Card>
    </Link>
  );
}
