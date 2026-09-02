"use client";

import { useState, useTransition } from "react";
import { updateKaderAvatar } from "@/lib/kader/actions";
import { AVATAR_EMOJI, nextAvatarSeed } from "@/lib/student/avatars";
import { AVATAR_SEED_LABELS } from "@/lib/student/types";
import type { KaderStatus } from "@/lib/student/types";

type Props = {
  fullName: string;
  status: KaderStatus;
  initialAvatarSeed: string;
  topicCount: number;
};

export function KaderAvatarHeader({
  fullName,
  status,
  initialAvatarSeed,
  topicCount,
}: Props) {
  const [avatarSeed, setAvatarSeed] = useState(initialAvatarSeed || "kucing");
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const emoji = AVATAR_EMOJI[avatarSeed] ?? "🐱";
  const label = AVATAR_SEED_LABELS[avatarSeed] ?? "Kucing";

  const statusLabel =
    status === "available" ? "Tersedia" : status === "busy" ? "Sibuk" : "Offline";
  const statusColor =
    status === "available"
      ? "text-emerald-600 bg-emerald-50 border-emerald-200"
      : status === "busy"
        ? "text-amber-600 bg-amber-50 border-amber-200"
        : "text-on-surface-variant bg-surface-container border-outline-variant";

  function handleSaveAvatar(newSeed: string) {
    setError(null);
    setAvatarSeed(newSeed);
    setIsPickerOpen(false);
    startTransition(async () => {
      try {
        await updateKaderAvatar(newSeed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal mengubah avatar");
      }
    });
  }

  function handleCycle() {
    const next = nextAvatarSeed(avatarSeed);
    handleSaveAvatar(next);
  }

  return (
    <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest overflow-hidden shadow-xs">
      {/* Top gradient banner */}
      <div className="h-28 w-full bg-gradient-to-r from-primary-fixed to-secondary-fixed opacity-90 relative" />

      {/* Main Avatar + Info Block */}
      <div className="px-md pb-md -mt-14 flex flex-col items-center text-center">
        {/* Interactive Avatar Container with Badge */}
        <div className="relative group">
          <button
            type="button"
            onClick={handleCycle}
            disabled={pending}
            title="Klik untuk ganti avatar"
            className="flex h-24 w-24 items-center justify-center rounded-full bg-secondary-fixed ring-4 ring-surface-container-lowest shadow-md text-5xl transition-transform active:scale-95 hover:scale-105 select-none cursor-pointer disabled:opacity-75"
            aria-label="Ganti Avatar Konselor"
          >
            {emoji}
          </button>

          {/* Quick cycle button overlay */}
          <button
            type="button"
            onClick={handleCycle}
            disabled={pending}
            aria-label="Ganti Avatar acak"
            title="Ganti ke avatar berikutnya"
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary shadow-sm hover:opacity-90 active:scale-90 transition-all border-2 border-surface-container-lowest"
          >
            <span className={pending ? "animate-spin text-sm" : "text-xs font-bold"}>🔄</span>
          </button>
        </div>

        {/* Change avatar trigger button */}
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPickerOpen(!isPickerOpen)}
            className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low hover:bg-surface-container px-3 py-1 text-label-sm font-semibold text-primary transition-colors cursor-pointer"
          >
            <span>Avatar: <strong>{label}</strong></span>
            <span className="text-xs">✏️ Pilih</span>
          </button>
        </div>

        {/* Avatar Picker Dropdown / Grid */}
        {isPickerOpen && (
          <div className="mt-3 p-3 w-full max-w-sm rounded-xl border border-outline-variant bg-surface-container-low shadow-sm animate-fade-in">
            <p className="text-label-sm font-semibold text-on-surface-variant mb-2">
              Pilih Karakter Avatar:
            </p>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(AVATAR_EMOJI).map(([seed, em]) => {
                const isSelected = seed === avatarSeed;
                return (
                  <button
                    key={seed}
                    type="button"
                    onClick={() => handleSaveAvatar(seed)}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg transition-all text-2xl ${
                      isSelected
                        ? "bg-primary-container text-on-primary-container ring-2 ring-primary scale-105"
                        : "bg-surface-container-lowest hover:bg-surface-container hover:scale-105"
                    }`}
                  >
                    <span>{em}</span>
                    <span className="text-[10px] font-medium mt-1 truncate max-w-full">
                      {AVATAR_SEED_LABELS[seed]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && (
          <p className="mt-2 text-label-sm text-error bg-error-container/40 px-3 py-1 rounded-md">
            {error}
          </p>
        )}

        <h1 className="mt-3 text-headline-md font-bold text-on-surface">Kak {fullName}</h1>

        {/* Status Pill */}
        <span
          className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-sm font-semibold border ${statusColor}`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          {statusLabel}
        </span>

        {/* Quick stats strip */}
        <div className="mt-4 w-full grid grid-cols-2 rounded-xl border border-outline-variant bg-surface-container-low/40 overflow-hidden">
          <div className="py-3 px-4 flex flex-col items-center gap-0.5 border-r border-outline-variant">
            <span className="text-headline-md font-bold text-primary">{topicCount}</span>
            <span className="text-label-sm text-on-surface-variant font-medium">Topik Bimbingan</span>
          </div>
          <div className="py-3 px-4 flex flex-col items-center gap-0.5">
            <span className="text-headline-md font-bold text-emerald-600">✓</span>
            <span className="text-label-sm text-on-surface-variant font-medium">Konselor Terverifikasi</span>
          </div>
        </div>
      </div>
    </div>
  );
}
