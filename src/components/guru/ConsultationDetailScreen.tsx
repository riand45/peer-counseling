"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ChatBubble } from "@/components/ui/ChatBubble";
import { Modal } from "@/components/ui/Modal";
import { useSessionChat } from "@/lib/chat/useSessionChat";
import {
  archiveSession,
  endConsultationAsGuru,
  getConsultationDetail,
  referToProfessional,
  takeOverConsultation,
} from "@/lib/guru/actions";
import { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/guru/types";
import { TOPIC_LABELS } from "@/lib/student/types";
import type { ConsultationDetail } from "@/lib/guru/types";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function formatRelativeTime(iso: string): string {
  const diffMinutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMinutes < 1) return "Baru saja";
  if (diffMinutes < 60) return `${diffMinutes} mnt lalu`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} jam lalu`;
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} hari lalu`;
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
  const router = useRouter();
  const [detail, setDetail] = useState<ConsultationDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingTakeOver, setConfirmingTakeOver] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmingReferral, setConfirmingReferral] = useState(false);
  const [referralNote, setReferralNote] = useState("");
  const [referring, setReferring] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
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

  async function handleConfirmReferral() {
    setReferring(true);
    setActionError(null);
    try {
      await referToProfessional({ sessionId, note: referralNote.trim() || undefined });
      setConfirmingReferral(false);
      setReferralNote("");
      await loadDetail();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal mencatat rujukan ke profesional");
    } finally {
      setReferring(false);
    }
  }

  async function handleConfirmArchive() {
    setArchiving(true);
    setActionError(null);
    try {
      await archiveSession({ sessionId });
      router.push("/guru/konsultasi");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal mengarsipkan sesi");
      setArchiving(false);
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
    return (
      <div className="flex flex-col gap-4 animate-pulse" aria-busy="true" aria-label="Memuat detail sesi">
        <div className="h-4 w-48 rounded-full bg-surface-container-high" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
          {/* Sidebar: Detail + Tindakan cards */}
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-sm flex flex-col gap-4">
              <div className="h-5 w-24 rounded-full bg-surface-container-high" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="h-3 w-20 rounded-full bg-surface-container-high" />
                  <div className="h-4 w-32 rounded-full bg-surface-container-high" />
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-sm flex flex-col gap-3">
              <div className="h-5 w-36 rounded-full bg-surface-container-high" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-9 w-full rounded-lg bg-surface-container-high" />
              ))}
            </div>
          </div>
          {/* Chat transcript card */}
          <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-sm flex flex-col gap-4">
            <div className="h-5 w-40 rounded-full bg-surface-container-high" />
            <div className="flex flex-col gap-4">
              {/* Alternating chat bubbles */}
              <div className="flex gap-2 items-end">
                <div className="h-8 w-8 rounded-full bg-surface-container-high shrink-0" />
                <div className="h-14 w-3/4 rounded-2xl bg-surface-container-high" />
              </div>
              <div className="flex gap-2 items-end justify-end">
                <div className="h-10 w-2/3 rounded-2xl bg-surface-container-high" />
              </div>
              <div className="flex gap-2 items-end">
                <div className="h-8 w-8 rounded-full bg-surface-container-high shrink-0" />
                <div className="h-12 w-1/2 rounded-2xl bg-surface-container-high" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
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
              <div className="mt-1 flex flex-wrap gap-2">
                <Chip tone={SESSION_STATUS_TONES[detail.status]}>{SESSION_STATUS_LABELS[detail.status]}</Chip>
                {detail.archivedAt && <Chip tone="neutral">Diarsipkan</Chip>}
              </div>
            </div>
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="text-headline-md text-on-surface">Tindakan Guru/BK</h2>
            {!detail.hasTakenOver && detail.status !== "ended" && !detail.archivedAt && (
              <Button onClick={() => setConfirmingTakeOver(true)}>✋ Ambil Alih Percakapan</Button>
            )}
            {detail.latestReferral ? (
              <div className="flex flex-col gap-2">
                <Button variant="secondary" disabled>
                  ⇄ Alihkan ke Profesional
                </Button>
                <Chip tone="secondary">
                  Dirujuk ke Profesional · {formatRelativeTime(detail.latestReferral.createdAt)}
                </Chip>
              </div>
            ) : (
              <Button
                variant="secondary"
                onClick={() => setConfirmingReferral(true)}
                disabled={Boolean(detail.archivedAt)}
              >
                ⇄ Alihkan ke Profesional
              </Button>
            )}
            <Button
              variant="ghost"
              onClick={handleEnd}
              disabled={ending || detail.status === "ended" || Boolean(detail.archivedAt)}
            >
              {ending ? "Menandai..." : "✓ Tandai Selesai"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmingArchive(true)}
              disabled={Boolean(detail.archivedAt) || detail.status !== "ended"}
            >
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

          {detail.hasTakenOver && !detail.archivedAt && (
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

      <Modal
        open={confirmingReferral}
        onClose={() => setConfirmingReferral(false)}
        title="Alihkan ke profesional?"
        description="Tandai sesi ini sebagai butuh penanganan profesional. Ini hanya mencatat penilaian Anda — tidak ada notifikasi atau pihak lain yang otomatis terlibat."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingReferral(false)} disabled={referring}>
              Batal
            </Button>
            <Button onClick={handleConfirmReferral} disabled={referring}>
              {referring ? "Menyimpan..." : "Alihkan"}
            </Button>
          </>
        }
      >
        <textarea
          value={referralNote}
          onChange={(e) => setReferralNote(e.target.value)}
          placeholder="Catatan (opsional)"
          rows={3}
          className="w-full resize-none rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
        />
      </Modal>

      <Modal
        open={confirmingArchive}
        onClose={() => setConfirmingArchive(false)}
        title="Hapus log konsultasi?"
        description="Sesi ini akan disembunyikan dari daftar aktif. Semua data (pesan, riwayat) tetap tersimpan dan tidak dihapus."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingArchive(false)} disabled={archiving}>
              Batal
            </Button>
            <Button onClick={handleConfirmArchive} disabled={archiving}>
              {archiving ? "Menghapus..." : "Hapus Log"}
            </Button>
          </>
        }
      />
    </div>
  );
}
