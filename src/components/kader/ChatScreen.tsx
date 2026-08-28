"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { EscalationModal } from "@/components/kader/EscalationModal";
import { useSessionChat } from "@/lib/chat/useSessionChat";
import { endKaderSession, getSessionStudentInfo } from "@/lib/kader/actions";
import { TOPIC_LABELS } from "@/lib/student/types";
import type { SessionStudentInfo } from "@/lib/kader/types";

function StudentAvatar({ displayName }: { displayName?: string }) {
  const initial = displayName?.trim().charAt(0).toUpperCase() || "A";

  return (
    <div
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary-container text-label-sm font-bold text-on-secondary-container"
    >
      {initial}
    </div>
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function ChatScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [ending, setEnding] = useState(false);
  const [escalationOpen, setEscalationOpen] = useState(false);
  const [escalationNotice, setEscalationNotice] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [studentInfo, setStudentInfo] = useState<SessionStudentInfo | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, error, send } = useSessionChat(sessionId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    getSessionStudentInfo({ sessionId })
      .then(setStudentInfo)
      .catch(() => {
        // Non-fatal: keep the generic fallback header if this fails.
      });
  }, [sessionId]);

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
      await endKaderSession({ sessionId });
      router.push("/kader");
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Gagal mengakhiri sesi, coba lagi");
      setEnding(false);
    }
  }

  function handleEscalated() {
    setEscalationOpen(false);
    setEscalationNotice("Eskalasi terkirim ke Guru/BK.");
    getSessionStudentInfo({ sessionId })
      .then(setStudentInfo)
      .catch(() => {
        // Non-fatal: the notice above already confirms the escalation went through.
      });
  }

  return (
    <main className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-outline-variant bg-surface-container-lowest px-sm py-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => router.back()} aria-label="Kembali">
            ←
          </button>
          <div>
            <p className="text-label-md font-semibold text-on-surface">
              {studentInfo?.displayName ?? "Siswa"}
            </p>
            {studentInfo && studentInfo.topics.length > 0 && (
              <Chip tone="secondary" className="mt-1">
                {TOPIC_LABELS[studentInfo.topics[0]]}
              </Chip>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => router.push(`/kader/alihkan/${sessionId}`)}
            disabled={studentInfo?.status === "ended"}
          >
            Alihkan
          </Button>
          <Button
            variant="ghost"
            onClick={() => setEscalationOpen(true)}
            disabled={studentInfo?.status === "ended" || studentInfo?.status === "escalated"}
          >
            {studentInfo?.status === "escalated" ? "Sudah Dieskalasi" : "Hubungi Guru/BK"}
          </Button>
          <Button variant="ghost" onClick={handleEnd} disabled={ending}>
            {ending ? "Mengakhiri..." : "Selesaikan Sesi"}
          </Button>
        </div>
      </header>

      <div className="border-b border-outline-variant bg-secondary-container px-sm py-2 text-label-sm text-on-secondary-container">
        ℹ️ Sesi ini dipantau oleh guru/BK demi keamanan.
      </div>

      {escalationNotice && (
        <div className="border-b border-outline-variant bg-secondary-container px-sm py-2 text-label-sm text-on-secondary-container">
          ✅ {escalationNotice}
        </div>
      )}

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
            viewerRole="kader"
            body={message.body}
            timestamp={formatTime(message.createdAt)}
            avatarNode={
              message.senderRole !== "kader" ? (
                <StudentAvatar displayName={studentInfo?.displayName} />
              ) : undefined
            }
            readReceipt={message.senderRole === "kader" ? "sent" : undefined}
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
          placeholder="Ketik balasan..."
          rows={1}
          className="flex-1 resize-none rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
        />
        <Button onClick={handleSend} disabled={!draft.trim()}>
          Kirim
        </Button>
      </div>

      <EscalationModal
        sessionId={sessionId}
        open={escalationOpen}
        onClose={() => setEscalationOpen(false)}
        onEscalated={handleEscalated}
      />
    </main>
  );
}
