import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { TOPIC_LABELS } from "@/lib/student/types";
import type { KaderDashboardSession } from "@/lib/kader/types";

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function SessionCard({ session }: { session: KaderDashboardSession }) {
  const initial = session.studentDisplayName.trim().charAt(0).toUpperCase() || "A";
  const primaryTopic = session.topics[0];

  return (
    <Link href={`/kader/chat/${session.id}`} className="block">
      <Card className="flex flex-col gap-3 transition-shadow hover:shadow-md border border-outline-variant border-r-4 border-r-primary bg-surface-container-lowest p-sm rounded-2xl relative overflow-hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-md font-bold text-on-secondary-container"
            >
              {initial}
            </div>
            <div>
              <p className="text-body-md font-bold text-on-surface leading-tight">
                {session.studentDisplayName}
              </p>
              {primaryTopic && (
                <span className="inline-block mt-1 px-2.5 py-0.5 rounded-full bg-surface-container-low text-label-sm font-semibold text-on-surface-variant">
                  {TOPIC_LABELS[primaryTopic]}
                </span>
              )}
            </div>
          </div>
          <span className="whitespace-nowrap text-label-sm font-medium text-on-surface-variant">
            {formatTime(session.lastMessageAt)}
          </span>
        </div>
        {session.lastMessagePreview && (
          <p className="truncate text-body-md text-on-surface-variant italic leading-normal px-1">
            &ldquo;{session.lastMessagePreview}&rdquo;
          </p>
        )}
      </Card>
    </Link>
  );
}
