"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { Modal } from "@/components/ui/Modal";
import { useSessionChat } from "@/lib/chat/useSessionChat";
import {
  endConsultationAsGuru,
  getConsultationDetail,
  takeOverConsultation,
} from "@/lib/guru/actions";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/guru/types";
import { TOPIC_LABELS } from "@/lib/student/types";
import type { ConsultationDetail } from "@/lib/guru/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function SenderAvatar({ displayName, tone }: { displayName?: string; tone: "student" | "kader" }) {
  const initial = displayName?.trim().charAt(0).toUpperCase() || "A";
  const toneClasses =
    tone === "student"
      ? "bg-secondary-container text-on-secondary-container"
      : "bg-tertiary-container text-on-tertiary-container";
  return (
    <div
      aria-hidden="true"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-label-sm font-bold ${toneClasses}`}
    >
      {initial}
    </div>
  );
}

export function ConsultationDetailScreen({ sessionId }: { sessionId: string }) {
  const [detail, setDetail] = useState<ConsultationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingTakeOver, setConfirmingTakeOver] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [ending, setEnding] = useState(false);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, error: chatError, send } = useSessionChat(sessionId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function loadDetail() {
    return getConsultationDetail({ sessionId })
      .then((data) => {
        setDetail(data);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Gagal memuat detail sesi"));
  }

  useEffect(() => {
    loadDetail();
    // loadDetail is intentionally not in the dep array: it always closes
    // over the same sessionId prop and re-creating it every render would
    // just re-run this effect for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function handleConfirmTakeOver() {
    setTakingOver(true);
    setActionError(null);
    try {
      await takeOverConsultation({ sessionId });
      setConfirmingTakeOver(false);
      await loadDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal mengambil alih percakapan");
    } finally {
      setTakingOver(false);
    }
  }

  async function handleEnd() {
    setEnding(true);
    setActionError(null);
    try {
      await endConsultationAsGuru({ sessionId });
      await loadDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal menandai sesi selesai");
    } finally {
      setEnding(false);
    }
  }

  async function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setActionError(null);
    try {
      await send(body);
      setDraft("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Pesan gagal terkirim, coba lagi");
    }
  }

  if (loadError && !detail) {
    return (
      <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
        {loadError}
      </p>
    );
  }

  if (!detail) {
    return <p className="text-body-md text-on-surface-variant">Memuat detail sesi...</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {!detail.hasTakenOver && (
        <div className="rounded-md bg-secondary-container px-4 py-3 text-label-md text-on-secondary-container">
          👁️ Mode Pantau: Guru/BK dapat melihat seluruh isi percakapan.
        </div>
      )}

      {(loadError || actionError) && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {loadError ?? actionError}
        </p>
      )}

      <Link href="/guru/konsultasi" className="text-label-md font-semibold text-primary">
        ← Kembali ke Daftar Konsultasi
      </Link>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3">
            <h2 className="text-headline-md text-on-surface">Detail Sesi</h2>
            <div>
              <p className="text-label-sm uppercase text-on-surface-variant">Pengguna (Anonim)</p>
              <p className="mt-1 font-semibold text-on-surface">{detail.studentDisplayName}</p>
            </div>
            <div>
              <p className="text-label-sm uppercase text-on-surface-variant">Kader Sebaya</p>
              <p className="mt-1 font-semibold text-on-surface">
                {detail.assignedKaderName ?? "- Belum Ditugaskan -"}
              </p>
            </div>
            <div>
              <p className="text-label-sm uppercase text-on-surface-variant">Topik</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {detail.topics.length === 0 && <span className="text-body-md text-on-surface-variant">-</span>}
                {detail.topics.map((topic) => (
                  <Chip key={topic} tone="secondary">
                    {TOPIC_LABELS[topic]}
                  </Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="text-label-sm uppercase text-on-surface-variant">Status</p>
              <Chip tone={SESSION_STATUS_TONES[detail.status]} className="mt-1">
                {SESSION_STATUS_LABELS[detail.status]}
              </Chip>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-headline-md text-on-surface">Tindakan Guru/BK</h2>
            {!detail.hasTakenOver && detail.status !== "ended" && (
              <Button onClick={() => setConfirmingTakeOver(true)}>✋ Ambil Alih Percakapan</Button>
            )}
            <Button variant="secondary" disabled title="Segera hadir">
              ⇄ Alihkan ke Profesional
            </Button>
            <Button variant="ghost" onClick={handleEnd} disabled={ending || detail.status === "ended"}>
              {ending ? "Menandai..." : "✓ Tandai Selesai"}
            </Button>
            <Button variant="ghost" disabled title="Segera hadir">
              🗑 Hapus Log
            </Button>
          </Card>
        </div>

        <Card className="flex flex-col gap-3">
          <div>
            <h2 className="text-headline-md text-on-surface">Transkrip Percakapan</h2>
            <p className="text-label-sm text-on-surface-variant">Dimulai: {formatTime(detail.createdAt)}</p>
          </div>

          {chatError && (
            <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
              {chatError}
            </p>
          )}

          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {messages.map((message) => (
              <ChatBubble
                key={message.id}
                senderRole={message.senderRole}
                viewerRole="guru"
                body={message.body}
                timestamp={formatTime(message.createdAt)}
                avatarNode={
                  message.senderRole === "student" ? (
                    <SenderAvatar displayName={detail.studentDisplayName} tone="student" />
                  ) : message.senderRole === "kader" ? (
                    <SenderAvatar displayName={detail.assignedKaderName ?? "Kader"} tone="kader" />
                  ) : undefined
                }
                readReceipt={message.senderRole === "guru" ? "sent" : undefined}
              />
            ))}
            <div ref={bottomRef} />
          </div>

          {detail.hasTakenOver && (
            <div className="flex items-center gap-2 border-t border-outline-variant pt-3">
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
          )}
        </Card>
      </div>

      <Modal
        open={confirmingTakeOver}
        onClose={() => setConfirmingTakeOver(false)}
        title="Ambil alih percakapan?"
        description="Sesi ini akan dipindahkan dari kader sebaya ke Anda. Kader sebelumnya tidak akan lagi melihat sesi ini sebagai konsultasi aktifnya."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingTakeOver(false)} disabled={takingOver}>
              Batal
            </Button>
            <Button onClick={handleConfirmTakeOver} disabled={takingOver}>
              {takingOver ? "Mengambil alih..." : "Ambil Alih"}
            </Button>
          </>
        }
      />
    </div>
  );
}
