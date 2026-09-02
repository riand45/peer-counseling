"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TransferKaderCard } from "./TransferKaderCard";
import { getAvailableKaderForTransfer, getSessionStudentInfo, transferSession } from "@/lib/kader/actions";
import type { KaderSummary } from "@/lib/student/types";

export function TransferScreen({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [studentName, setStudentName] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<KaderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<KaderSummary | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([getSessionStudentInfo({ sessionId }), getAvailableKaderForTransfer({ sessionId })])
      .then(([info, list]) => {
        setStudentName(info.displayName);
        setCandidates(list);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Gagal memuat daftar konselor"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  function handleSelect(kader: KaderSummary) {
    setActionError(null);
    setSelected(kader);
  }

  function handleCloseModal() {
    setSelected(null);
    setActionError(null);
  }

  async function handleConfirm() {
    if (!selected) return;
    setTransferring(true);
    setActionError(null);
    try {
      await transferSession({ sessionId, toKaderId: selected.id });
      router.push("/kader");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal mengalihkan konsultasi");
      setTransferring(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button variant="ghost" onClick={() => router.back()}>
          ← Kembali
        </Button>
        <h1 className="mt-2 text-headline-lg-mobile font-bold text-on-background md:text-headline-lg">
          Alihkan Konsultasi
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Pilih Konselor yang tersedia untuk mengambil alih sesi konsultasi {studentName ?? "siswa ini"}.
        </p>
      </div>

      {loadError && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {loadError}
        </p>
      )}

      {loading && (
        <div className="flex flex-col gap-3 animate-pulse" aria-busy="true" aria-label="Memuat daftar konselor">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-2xl border border-outline-variant bg-surface-container-lowest p-sm">
              <div className="h-10 w-10 shrink-0 rounded-full bg-surface-container-high" />
              <div className="flex flex-col gap-2 flex-1">
                <div className="h-4 w-32 rounded-full bg-surface-container-high" />
                <div className="h-3 w-20 rounded-full bg-surface-container-high" />
              </div>
            </div>
          ))}
        </div>
      )}


      {!loading && !loadError && candidates.length === 0 && (
        <p className="text-body-md text-on-surface-variant">
          Tidak ada konselor lain yang sedang tersedia saat ini.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {candidates.map((kader) => (
          <TransferKaderCard key={kader.id} kader={kader} onSelect={handleSelect} />
        ))}
      </div>

      <Modal
        open={selected !== null}
        onClose={handleCloseModal}
        title="Konfirmasi Pengalihan"
        description={
          selected
            ? `Yakin ingin mengalihkan konsultasi ${studentName ?? "siswa ini"} ke Kak ${selected.fullName}?`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={handleCloseModal} disabled={transferring}>
              Batal
            </Button>
            <Button onClick={handleConfirm} disabled={transferring}>
              {transferring ? "Mengalihkan..." : "Ya, Alihkan"}
            </Button>
          </>
        }
      >
        {actionError && (
          <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
            {actionError}
          </p>
        )}
      </Modal>
    </div>
  );
}
