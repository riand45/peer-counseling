"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { listProfiles, verifyProfile } from "@/lib/guru/actions";
import type { ProfileListItem, ProfileListResult, ProfileRole } from "@/lib/guru/types";

const ROLE_TABS: { value: ProfileRole | "all"; label: string }[] = [
  { value: "all", label: "Semua" },
  { value: "kader", label: "Kader" },
  { value: "guru", label: "Guru BK" },
];

function StatusBadge({ verified }: { verified: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-label-sm font-semibold",
        verified
          ? "bg-[color-mix(in_srgb,var(--color-tertiary)_15%,transparent)] text-tertiary"
          : "bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)] text-error",
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          verified ? "bg-tertiary" : "bg-error",
        )}
      />
      {verified ? "Terverifikasi" : "Belum Diverifikasi"}
    </span>
  );
}

function RoleBadge({ role }: { role: ProfileRole }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-label-sm font-medium",
        role === "guru"
          ? "bg-[color-mix(in_srgb,var(--color-primary)_12%,transparent)] text-primary"
          : "bg-[color-mix(in_srgb,var(--color-secondary)_12%,transparent)] text-secondary",
      )}
    >
      {role === "guru" ? "Guru BK" : "Kader"}
    </span>
  );
}

function VerifyToggleButton({
  profile,
  onToggle,
}: {
  profile: ProfileListItem;
  onToggle: (id: string, next: boolean) => void;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(() => {
      onToggle(profile.id, !profile.isVerified);
    });
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-label-sm font-semibold transition-all",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        isPending && "opacity-60 cursor-not-allowed",
        profile.isVerified
          ? "border border-error text-error hover:bg-[color-mix(in_srgb,var(--color-error)_8%,transparent)] focus-visible:outline-error"
          : "bg-primary text-on-primary shadow-sm hover:opacity-90 focus-visible:outline-primary",
      )}
    >
      {isPending ? "Menyimpan..." : profile.isVerified ? "Cabut Verifikasi" : "Verifikasi"}
    </button>
  );
}

export function VerifikasiScreen() {
  const [roleFilter, setRoleFilter] = useState<ProfileRole | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ProfileListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const fetchProfiles = useCallback(() => {
    setLoading(true);
    listProfiles({
      role: roleFilter === "all" ? undefined : roleFilter,
      search: debouncedSearch,
      page,
    })
      .then((data) => {
        setResult(data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat daftar profil"))
      .finally(() => setLoading(false));
  }, [roleFilter, debouncedSearch, page]);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  function handleRoleChange(next: ProfileRole | "all") {
    setRoleFilter(next);
    setPage(1);
  }

  function handleSearchChange(next: string) {
    setSearch(next);
    setPage(1);
  }

  async function handleToggle(profileId: string, isVerified: boolean) {
    try {
      await verifyProfile({ profileId, isVerified });
      fetchProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memperbarui status verifikasi");
    }
  }

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
          Verifikasi Profil
        </h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Kelola dan verifikasi akun kader maupun guru BK yang mendaftar.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 rounded-lg border border-outline-variant bg-surface-container-lowest p-md md:flex-row md:items-center md:justify-between">
        <input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Cari nama atau ID..."
          className="w-full rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest md:max-w-[24rem]"
        />
        <div className="inline-flex flex-wrap gap-1 rounded-full border border-outline-variant bg-surface-container-low p-1">
          {ROLE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => handleRoleChange(tab.value)}
              className={cn(
                "rounded-full px-4 py-2 text-label-md font-semibold transition-colors",
                roleFilter === tab.value
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:bg-surface-variant",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
          {error}
        </p>
      )}

      {/* Table */}
      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-body-md text-on-surface">
            <thead>
              <tr className="border-b border-outline-variant">
                <th className="px-4 py-3 text-label-md font-semibold text-on-surface-variant">Nama</th>
                <th className="px-4 py-3 text-label-md font-semibold text-on-surface-variant">Peran</th>
                <th className="px-4 py-3 text-label-md font-semibold text-on-surface-variant">Status</th>
                <th className="px-4 py-3 text-label-md font-semibold text-on-surface-variant">Terdaftar</th>
                <th className="px-4 py-3 text-right text-label-md font-semibold text-on-surface-variant">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                    Memuat daftar profil...
                  </td>
                </tr>
              ) : !result || result.items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                    Tidak ada profil yang ditemukan.
                  </td>
                </tr>
              ) : (
                result.items.map((profile) => (
                  <tr
                    key={profile.id}
                    className="border-b border-outline-variant/50 last:border-0 transition-colors hover:bg-surface-container-low/50"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-on-surface">
                        {profile.fullName ?? (
                          <span className="italic text-on-surface-variant">Tanpa nama</span>
                        )}
                      </div>
                      <div className="mt-0.5 font-mono text-label-sm text-on-surface-variant">
                        {profile.id.slice(0, 8)}…
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <RoleBadge role={profile.role} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge verified={profile.isVerified} />
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {new Date(profile.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <VerifyToggleButton profile={profile} onToggle={handleToggle} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {result && result.total > result.pageSize && (
          <div className="flex items-center justify-between border-t border-outline-variant px-4 py-3">
            <p className="text-label-md text-on-surface-variant">
              Menampilkan{" "}
              <span className="font-semibold text-on-surface">
                {(result.page - 1) * result.pageSize + 1}–
                {Math.min(result.page * result.pageSize, result.total)}
              </span>{" "}
              dari <span className="font-semibold text-on-surface">{result.total}</span> profil
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-md border border-outline-variant px-3 py-1.5 text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
              >
                ← Sebelumnya
              </button>
              <span className="text-label-md text-on-surface-variant">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-outline-variant px-3 py-1.5 text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
              >
                Berikutnya →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
