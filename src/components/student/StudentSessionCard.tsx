import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { StudentEmojiAvatar } from "@/components/ui/Avatar";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/kader/types";
import { TOPIC_EMOJI, TOPIC_LABELS } from "@/lib/student/types";
import type { StudentSessionSummary } from "@/lib/student/types";

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function StudentSessionCard({ session }: { session: StudentSessionSummary }) {
  const primaryTopic = session.topics[0];

  return (
    <Link href={`/student/chat/${session.id}`}>
      <Card className="flex flex-col gap-2 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <StudentEmojiAvatar avatarSeed={session.kaderAvatarSeed} size="md" />
            <div>
              <p className="text-label-md font-semibold text-on-surface">{session.kaderName ?? "Konselor"}</p>
              {primaryTopic && (
                <Chip tone="secondary" className="mt-1">
                  {TOPIC_EMOJI[primaryTopic]} {TOPIC_LABELS[primaryTopic]}
                </Chip>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Chip tone={SESSION_STATUS_TONES[session.status]}>{SESSION_STATUS_LABELS[session.status]}</Chip>
            <span className="text-label-sm text-on-surface-variant">{formatTime(session.lastMessageAt)}</span>
          </div>
        </div>
        {session.lastMessagePreview && (
          <p className="truncate text-body-md text-on-surface-variant">{session.lastMessagePreview}</p>
        )}
      </Card>
    </Link>
  );
}
