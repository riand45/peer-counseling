"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { useSessionChat } from "@/lib/chat/useSessionChat";
import { endSession, getSessionKader } from "@/lib/student/actions";
import { useRequireStudentIdentity } from "@/lib/student/useRequireStudentIdentity";
import { ReportModal } from "./ReportModal";

function KaderAvatar({ fullName }: { fullName?: string }) {
  const initial = fullName?.trim().charAt(0).toUpperCase() || "K";

  return (
    <div
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-fixed text-label-sm font-bold text-on-secondary-fixed"
    >
      {initial}
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
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
  const [kaderInfo, setKaderInfo] = useState<{ fullName: string; status: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, error, send } = useSessionChat(sessionId, studentLocalId);

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
      <header className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-sm py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.back()} aria-label="Kembali">
            ←
          </button>
          <p className="text-label-md font-semibold text-on-surface">
            {kaderInfo?.fullName ?? "Kader"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            aria-label="Laporkan Sesi"
            className="text-on-surface-variant hover:text-error"
          >
            🚩
          </button>
          <Button variant="ghost" onClick={handleEnd} disabled={ending}>
            {ending ? "Mengakhiri..." : "Selesaikan Sesi"}
          </Button>
        </div>
      </header>

      <div className="border-b border-outline-variant bg-secondary-container px-sm py-2 text-label-sm text-on-secondary-container">
        ℹ️ Percakapan ini dapat dipantau oleh guru/BK.
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

      <div className="flex-1 space-y-3 overflow-y-auto p-sm">
        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            senderRole={message.senderRole}
            viewerRole="student"
            body={message.body}
            timestamp={formatTime(message.createdAt)}
            avatarNode={
              message.senderRole !== "student" ? (
                <KaderAvatar fullName={kaderInfo?.fullName} />
              ) : undefined
            }
            readReceipt={message.senderRole === "student" ? "sent" : undefined}
          />
        ))}
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
