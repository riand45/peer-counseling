"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { StudentEmojiAvatar } from "@/components/ui/Avatar";
import { useSessionChat } from "@/lib/chat/useSessionChat";
import { endSession, getSessionKader } from "@/lib/student/actions";
import { useRequireStudentIdentity } from "@/lib/student/useRequireStudentIdentity";
import { ReportModal } from "./ReportModal";


function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function getRelativeDateLabel(isoString: string): string {
  const date = new Date(isoString);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  if (isSameDay(date, today)) {
    return "Hari ini";
  } else if (isSameDay(date, yesterday)) {
    return "Kemarin";
  } else {
    return date.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
    });
  }
}

export function ChatScreen({ sessionId }: { sessionId: string }) {
  const studentLocalId = useRequireStudentIdentity();

  if (!studentLocalId) {
    return null;
  }

  return <ChatSession sessionId={sessionId} studentLocalId={studentLocalId} />;
}

function ChatSession({
  sessionId,
  studentLocalId,
}: {
  sessionId: string;
  studentLocalId: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [ending, setEnding] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [kaderInfo, setKaderInfo] = useState<{ fullName: string; status: string; avatarSeed?: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, error, loading, send } = useSessionChat(sessionId, studentLocalId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    getSessionKader({ sessionId, studentLocalId })
      .then(setKaderInfo)
      .catch(() => {
        // Non-fatal: keep the generic "Kader" fallback if this fails.
      });
  }, [sessionId, studentLocalId]);

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setSendError(null);
    try {
      await send(body);
      setDraft("");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Pesan gagal terkirim, coba lagi");
    }
  }

  async function handleEnd() {
    setEnding(true);
    setSendError(null);
    try {
      await endSession({ sessionId, studentLocalId });
      router.push("/student/cerita-saya");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Gagal mengakhiri sesi, coba lagi");
      setEnding(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-sm py-3 w-full shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Kembali"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-container-low transition-colors"
          >
            <span className="text-headline-md leading-none font-bold">←</span>
          </button>
          <div className="flex items-center gap-2">
            {kaderInfo ? (
              <>
                <StudentEmojiAvatar avatarSeed={kaderInfo.avatarSeed} size="sm" />
                <div>
                  <p className="text-body-md font-bold text-on-surface leading-tight">
                    {kaderInfo.fullName}
                  </p>
                  <p className="text-label-sm text-on-surface-variant leading-none">
                    Peer Counselor
                  </p>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 animate-pulse" aria-hidden="true">
                <div className="h-8 w-8 rounded-full bg-surface-container-high shrink-0" />
                <div className="flex flex-col gap-1.5">
                  <div className="h-4 w-24 rounded-full bg-surface-container-high" />
                  <div className="h-3 w-16 rounded-full bg-surface-container-high" />
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            aria-label="Laporkan Sesi"
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-container-low transition-colors text-headline-sm"
          >
            🚩
          </button>
          <Button
            variant="secondary"
            onClick={handleEnd}
            disabled={ending}
            className="py-1 px-3 text-label-sm"
          >
            {ending ? "..." : "Selesaikan"}
          </Button>
        </div>
      </header>

      <div className="border-b border-outline-variant bg-secondary-container px-sm py-2 text-label-sm text-on-secondary-container">
        ℹ️ Percakapan ini dapat dipantau oleh guru.
      </div>

      {error && (
        <p className="mx-sm mt-2 rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      {sendError && (
        <p className="mx-sm mt-2 rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {sendError}
        </p>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto p-sm bg-surface-container-lowest animate-fade-in">
        {loading ? (
          <div className="flex flex-col gap-4 animate-pulse" aria-busy="true" aria-label="Memuat pesan">
            <div className="flex gap-2 items-end">
              <div className="h-8 w-8 rounded-full bg-surface-container-high shrink-0" />
              <div className="h-10 w-2/3 rounded-2xl bg-surface-container-high" />
            </div>
            <div className="flex gap-2 items-end justify-end">
              <div className="h-14 w-1/2 rounded-2xl bg-surface-container-high" />
            </div>
            <div className="flex gap-2 items-end">
              <div className="h-8 w-8 rounded-full bg-surface-container-high shrink-0" />
              <div className="h-12 w-3/4 rounded-2xl bg-surface-container-high" />
            </div>
          </div>
        ) : (
          messages.map((message, index) => {
            const dateLabel = getRelativeDateLabel(message.createdAt);
            const prevMessage = index > 0 ? messages[index - 1] : null;
            const showDateDivider = !prevMessage || getRelativeDateLabel(prevMessage.createdAt) !== dateLabel;

            return (
              <div key={message.id} className="flex flex-col gap-3">
                {showDateDivider && (
                  <div className="flex justify-center my-4 animate-fade-in">
                    <span className="rounded-full bg-surface-container-high px-3.5 py-1 text-label-sm font-semibold text-on-surface-variant shadow-xs">
                      {dateLabel}
                    </span>
                  </div>
                )}
                <ChatBubble
                  senderRole={message.senderRole}
                  viewerRole="student"
                  body={message.body}
                  timestamp={formatTime(message.createdAt)}
                  avatarNode={
                    message.senderRole !== "student" ? (
                      <StudentEmojiAvatar avatarSeed={kaderInfo?.avatarSeed} size="sm" />
                    ) : undefined
                  }
                  readReceipt={message.senderRole === "student" ? "sent" : undefined}
                />
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-center gap-2 border-t border-outline-variant bg-surface-container-lowest p-sm">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Ketik pesan..."
          rows={1}
          className="flex-1 resize-none rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
        />
        <Button onClick={handleSend} disabled={!draft.trim()}>
          Kirim
        </Button>
      </div>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        sessionId={sessionId}
        studentLocalId={studentLocalId}
      />
    </main>
  );
}
