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
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Gagal memuat daftar kader"))
      .finally(() => setLoading(false));
  }, [sessionId]);

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
          Pilih Kader yang tersedia untuk mengambil alih sesi konsultasi {studentName ?? "siswa ini"}.
        </p>
      </div>

      {loadError && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {loadError}
        </p>
      )}

      {actionError && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {actionError}
        </p>
      )}

      {loading && <p className="text-body-md text-on-surface-variant">Memuat daftar kader...</p>}

      {!loading && !loadError && candidates.length === 0 && (
        <p className="text-body-md text-on-surface-variant">
          Tidak ada kader lain yang sedang tersedia saat ini.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {candidates.map((kader) => (
          <TransferKaderCard key={kader.id} kader={kader} onSelect={setSelected} />
        ))}
      </div>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Konfirmasi Pengalihan"
        description={
          selected
            ? `Yakin ingin mengalihkan konsultasi ${studentName ?? "siswa ini"} ke Kak ${selected.fullName}?`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)} disabled={transferring}>
              Batal
            </Button>
            <Button onClick={handleConfirm} disabled={transferring}>
              {transferring ? "Mengalihkan..." : "Ya, Alihkan"}
            </Button>
          </>
        }
      />
    </div>
  );
}
