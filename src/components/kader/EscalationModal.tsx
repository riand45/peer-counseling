"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { escalateSession } from "@/lib/kader/actions";

export function EscalationModal({
  sessionId,
  open,
  onClose,
  onEscalated,
}: {
  sessionId: string;
  open: boolean;
  onClose: () => void;
  onEscalated: () => void;
}) {
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setSending(true);
    setError(null);
    try {
      await escalateSession({ sessionId, reason: reason.trim() || null });
      setReason("");
      onEscalated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim eskalasi, coba lagi");
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Hubungi Guru/BK"
      description="Gunakan fitur ini jika kamu merasa kasus ini membutuhkan bantuan profesional dari guru atau konselor sekolah. Privasi tetap dijaga."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={sending}>
            {sending ? "Mengirim..." : "Kirim ke Guru/BK"}
          </Button>
        </>
      }
    >
      <div className="text-left">
        <label htmlFor="escalation-reason" className="mb-2 block text-label-md text-on-surface-variant">
          Alasan Eskalasi (Opsional)
        </label>
        <textarea
          id="escalation-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Tuliskan alasan eskalasi di sini..."
          rows={4}
          className="w-full resize-none rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
        />
        {error && <p className="mt-2 text-label-sm text-error">{error}</p>}
      </div>
    </Modal>
  );
}
