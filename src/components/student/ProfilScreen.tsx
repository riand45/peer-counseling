"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { AvatarIcon } from "./AvatarIcon";
import { useRequireStudentIdentity } from "@/lib/student/useRequireStudentIdentity";
import { deleteStudentIdentity, getStudentProfile, updateStudentProfile } from "@/lib/student/actions";
import { getStudentDisplayName } from "@/lib/student/types";
import { nextAvatarSeed } from "@/lib/student/avatars";
import { clearStudentLocalId } from "@/lib/student/identity";
import type { StudentProfile } from "@/lib/student/types";

export function ProfilScreen() {
  const router = useRouter();
  const studentLocalId = useRequireStudentIdentity();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftNickname, setDraftNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [cycling, setCycling] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!studentLocalId) return;
    getStudentProfile({ studentLocalId })
      .then(setProfile)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Gagal memuat profil"));
  }, [studentLocalId]);

  if (!studentLocalId) {
    return null;
  }

  if (loadError) {
    return (
      <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
        {loadError}
      </p>
    );
  }

  if (!profile) {
    return <p className="text-body-md text-on-surface-variant">Memuat profil...</p>;
  }

  const handleCycleAvatar = async () => {
    const seed = nextAvatarSeed(profile.avatarSeed);
    setCycling(true);
    setActionError(null);
    try {
      await updateStudentProfile({ studentLocalId, avatarSeed: seed });
      setProfile({ ...profile, avatarSeed: seed });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal mengganti avatar");
    } finally {
      setCycling(false);
    }
  };

  const handleSaveNickname = async () => {
    setSaving(true);
    setActionError(null);
    try {
      await updateStudentProfile({ studentLocalId, nickname: draftNickname });
      setProfile({ ...profile, nickname: draftNickname.trim() || null });
      setEditing(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal menyimpan nama panggilan");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setActionError(null);
    try {
      await deleteStudentIdentity({ studentLocalId });
      clearStudentLocalId();
      router.push("/");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Gagal menghapus akun");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  const displayName = getStudentDisplayName(profile.nickname, profile.avatarSeed);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">Profil Anonim</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Identitasmu tetap rahasia. Kamu bisa mengubah nama panggilanmu di sini untuk digunakan dalam ruang chat.
        </p>
      </div>

      <Card className="flex flex-col items-center gap-4">
        <div className="relative">
          <AvatarIcon seed={profile.avatarSeed} />
          <button
            type="button"
            onClick={handleCycleAvatar}
            disabled={cycling}
            aria-label="Ganti Avatar"
            className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm disabled:opacity-50"
          >
            🔄
          </button>
        </div>
        <span className="rounded-full bg-surface-container-highest px-3 py-1 text-label-sm text-on-surface-variant">
          Avatar acak
        </span>
      </Card>

      <Card className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-label-sm uppercase text-on-surface-variant">Nama Panggilan (Anonim)</p>
          <span aria-hidden="true">🛡️</span>
        </div>
        {editing ? (
          <div className="flex gap-2">
            <input
              value={draftNickname}
              onChange={(e) => setDraftNickname(e.target.value)}
              placeholder="mis. Sahabat Langit"
              className="flex-1 rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest"
            />
            <Button onClick={handleSaveNickname} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <h2 className="text-headline-md text-on-surface">{displayName}</h2>
            <button
              type="button"
              onClick={() => {
                setDraftNickname(profile.nickname ?? "");
                setEditing(true);
              }}
              aria-label="Edit nama"
              className="text-primary"
            >
              ✏️
            </button>
          </div>
        )}
      </Card>

      <div className="flex items-start gap-3 rounded-lg bg-secondary-fixed/30 p-4">
        <span aria-hidden="true">🔒</span>
        <div>
          <h3 className="text-label-md font-semibold text-on-surface">Zona Aman &amp; Rahasia</h3>
          <p className="text-body-md text-on-surface-variant">
            Kami tidak menyimpan data pribadi Anda di profil ini. Konselor atau teman sebaya hanya akan melihat
            avatar dan nama panggilan di atas.
          </p>
        </div>
      </div>

      {actionError && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {actionError}
        </p>
      )}

      <Button variant="ghost" onClick={() => setConfirmingDelete(true)}>
        🗑 Hapus Akun Anonim
      </Button>

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Hapus akun anonim?"
        description="Semua riwayat percakapanmu akan dihapus permanen dan tidak bisa dikembalikan."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Batal
            </Button>
            <Button onClick={handleDelete} disabled={deleting}>
              {deleting ? "Menghapus..." : "Hapus"}
            </Button>
          </>
        }
      />
    </div>
  );
}
