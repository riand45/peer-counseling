"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { submitSessionReport } from "@/lib/student/actions";
import { REPORT_REASON_LABELS } from "@/lib/student/types";
import type { ReportReason } from "@/lib/student/types";

const REASONS: ReportReason[] = ["uncomfortable", "unresponsive", "need_teacher", "other"];

export function ReportModal({
  open,
  onClose,
  sessionId,
  studentLocalId,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  studentLocalId: string;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function handleClose() {
    setReason(null);
    setDetails("");
    setError(null);
    setSubmitted(false);
    onClose();
  }

  async function handleSubmit() {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitSessionReport({
        sessionId,
        studentLocalId,
        reason,
        details: reason === "other" ? details : undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim laporan");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Modal open={open} onClose={handleClose} title="Laporan Terkirim">
        <p className="text-body-lg text-on-surface-variant">
          Terima kasih sudah memberi tahu kami. Laporanmu akan ditinjau oleh pihak sekolah.
        </p>
        <Button className="mt-6 w-full" variant="ghost" onClick={handleClose}>
          Tutup
        </Button>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Laporkan Sesi"
      description="Laporanmu akan ditinjau oleh pihak sekolah secara rahasia."
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={!reason || submitting}>
            {submitting ? "Mengirim..." : "Kirim Laporan"}
          </Button>
        </>
      }
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-label-md font-semibold text-on-surface">
          Pilih alasan laporan (wajib)
        </legend>
        {REASONS.map((value) => (
          <label
            key={value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
              reason === value ? "border-primary bg-secondary-container/40" : "border-outline-variant",
            )}
          >
            <input
              type="radio"
              name="reason"
              value={value}
              checked={reason === value}
              onChange={() => setReason(value)}
              className="h-4 w-4"
            />
            <span className="text-body-md text-on-surface">{REPORT_REASON_LABELS[value]}</span>
          </label>
        ))}
      </fieldset>

      {reason === "other" && (
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Ceritakan lebih lanjut (opsional)"
          rows={3}
          className="mt-3 w-full resize-none rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
        />
      )}

      {error && (
        <p className="mt-3 rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}
    </Modal>
  );
}
