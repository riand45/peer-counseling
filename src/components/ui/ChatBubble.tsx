import { cn } from "@/lib/cn";
import type { SenderRole } from "@/lib/chat/types";

type ChatBubbleProps = {
  senderRole: SenderRole;
  body: string;
  timestamp: string;
  viewerRole: SenderRole;
};

export function ChatBubble({ senderRole, body, timestamp, viewerRole }: ChatBubbleProps) {
  const isOwn = senderRole === viewerRole;

  return (
    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[75%] rounded-lg px-4 py-2.5 text-body-md",
          isOwn
            ? "rounded-br-sm bg-primary text-on-primary"
            : "rounded-bl-sm bg-surface-container-high text-on-surface",
        )}
      >
        <p>{body}</p>
        <p
          className={cn(
            "mt-1 text-label-sm",
            isOwn ? "text-on-primary/70" : "text-on-surface-variant",
          )}
        >
          {timestamp}
        </p>
      </div>
    </div>
  );
}
