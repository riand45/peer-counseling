"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { updateKaderBio } from "@/lib/kader/actions";
import { MAX_BIO_LENGTH } from "@/lib/kader/types";

export function BioEditor({ bio }: { bio: string | null }) {
  const [saved, setSaved] = useState(bio ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bio ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleEdit() {
    setDraft(saved);
    setError(null);
    setEditing(true);
  }

  function handleCancel() {
    setDraft(saved);
    setError(null);
    setEditing(false);
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateKaderBio(draft);
        setSaved(draft.trim());
        setEditing(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal menyimpan bio");
      }
    });
  }

  if (!editing) {
    return (
      <div>
        <p className="text-body-md text-on-surface-variant">
          {saved || "Belum ada bio. Tambahkan bio singkat agar adik kelas lebih mengenalmu."}
        </p>
        <Button variant="ghost" className="mt-3" onClick={handleEdit}>
          Edit Bio
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="relative">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_BIO_LENGTH}
          rows={4}
          placeholder="Ceritakan sedikit tentang dirimu..."
          className="w-full resize-none rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
        />
        <span className="absolute bottom-2 right-2 text-label-sm text-on-surface-variant">
          {draft.length}/{MAX_BIO_LENGTH}
        </span>
      </div>
      {error && <p className="mt-2 text-label-sm text-error">{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="ghost" onClick={handleCancel} disabled={pending}>
          Batal
        </Button>
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Menyimpan..." : "Simpan"}
        </Button>
      </div>
    </div>
  );
}
