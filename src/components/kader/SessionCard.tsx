import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { StudentEmojiAvatar } from "@/components/ui/Avatar";
import { TOPIC_LABELS } from "@/lib/student/types";
import { SESSION_STATUS_LABELS } from "@/lib/kader/types";
import type { KaderDashboardSession, SessionStatus } from "@/lib/kader/types";

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMins < 1) return "Baru saja";
  if (diffMins < 60) return `${diffMins} mnt lalu`;
  if (diffHrs < 24) return `${diffHrs} jam lalu`;
  if (diffDays < 7) return `${diffDays} hari lalu`;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

const STATUS_BORDER: Record<SessionStatus, string> = {
  waiting: "border-r-outline-variant",
  active: "border-r-primary",
  escalated: "border-r-error",
  ended: "border-r-outline-variant",
};

const STATUS_BADGE_STYLE: Partial<Record<SessionStatus, string>> = {
  ended: "bg-surface-container text-on-surface-variant",
  escalated: "bg-error-container text-on-error-container",
};

export function SessionCard({ session }: { session: KaderDashboardSession }) {
  const primaryTopic = session.topics[0];
  const status = session.status ?? "active";
  const borderClass = STATUS_BORDER[status] ?? "border-r-primary";
  const badgeStyle = STATUS_BADGE_STYLE[status];

  return (
    <Link href={`/kader/chat/${session.id}`} className="block group">
      <Card
        className={`flex flex-col gap-3 transition-shadow hover:shadow-md border border-outline-variant border-r-4 ${borderClass} bg-surface-container-lowest p-sm rounded-2xl relative overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <StudentEmojiAvatar avatarSeed={session.studentAvatarSeed} size="md" />
            <div>
              <p className="text-body-md font-bold text-on-surface leading-tight">
                {session.studentDisplayName}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {primaryTopic && (
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-surface-container-low text-label-sm font-semibold text-on-surface-variant">
                    {TOPIC_LABELS[primaryTopic]}
                  </span>
                )}
                {badgeStyle && (
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-label-sm font-semibold ${badgeStyle}`}>
                    {SESSION_STATUS_LABELS[status]}
                  </span>
                )}
              </div>
            </div>
          </div>
          <span className="whitespace-nowrap text-label-sm font-medium text-on-surface-variant shrink-0">
            {formatRelativeTime(session.lastMessageAt)}
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
