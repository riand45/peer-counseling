"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { getKaderDashboard, acceptKaderSession } from "@/lib/kader/actions";
import type { KaderDashboard } from "@/lib/kader/types";
import { StatusToggle } from "./StatusToggle";
import { SessionCard } from "./SessionCard";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

function getWaitingDuration(startedAt: string | null): string {
  if (!startedAt) return "Menunggu";
  const start = new Date(startedAt);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Menunggu baru saja";
  if (diffMins < 60) return `Menunggu ${diffMins} menit`;
  const diffHrs = Math.floor(diffMins / 60);
  return `Menunggu ${diffHrs} jam`;
}

export function DashboardScreen() {
  const [dashboard, setDashboard] = useState<KaderDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channelRef: ReturnType<typeof supabase.channel> | null = null;

    async function setup() {
      // Initial data fetch
      try {
        const data = await getKaderDashboard();
        if (!cancelled) setDashboard(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat dashboard");
      }

      // Get current user for scoped filter
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      // Build channel and register listener BEFORE subscribing
      const ch = supabase.channel(`kader-dashboard-${user.id}-${Date.now()}`);
      ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sessions",
          filter: `assigned_to=eq.${user.id}`,
        },
        () => {
          if (cancelled) return;
          getKaderDashboard()
            .then((data) => { if (!cancelled) setDashboard(data); })
            .catch((err) => console.error("Realtime dashboard refresh error:", err));
        }
      );
      ch.subscribe();
      channelRef = ch;
    }

    setup();

    return () => {
      cancelled = true;
      if (channelRef) {
        channelRef.unsubscribe();
        supabase.removeChannel(channelRef);
        channelRef = null;
      }
    };
  }, []);

  async function handleAccept(sessionId: string) {
    setAcceptingId(sessionId);
    startTransition(async () => {
      try {
        await acceptKaderSession({ sessionId });
        const data = await getKaderDashboard();
        setDashboard(data);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Gagal menerima sesi");
      } finally {
        setAcceptingId(null);
      }
    });
  }

  if (error) {
    return (
      <p className="rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
        {error}
      </p>
    );
  }

  if (!dashboard) {
    return <p className="text-body-md text-on-surface-variant">Memuat dashboard...</p>;
  }

  return (
    <div className="flex flex-col gap-6 font-sans">
      {/* Greeting and Status Toggle */}
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-md">
            Halo, Kak {dashboard.fullName}!
          </h1>
          <p className="mt-1 text-body-md text-on-surface-variant leading-tight">
            Siap membantu teman-teman hari ini?
          </p>
        </div>
        <StatusToggle status={dashboard.status} />
      </div>

      {/* Stats Widget Cards */}
      <div className="grid grid-cols-2 gap-4">
        {/* Active Consultation Stats */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-xs">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              <path d="M8 7h8M8 11h8" />
            </svg>
          </div>
          <div>
            <p className="text-headline-lg font-bold text-on-surface leading-none">
              {dashboard.activeSessions.length}
            </p>
            <p className="text-label-sm font-semibold text-on-surface-variant leading-tight mt-1">
              Konsultasi Aktif
            </p>
          </div>
        </div>

        {/* Waiting Sessions Stats */}
        <div className="flex items-center gap-3.5 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 shadow-xs">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-500 text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 2h14M5 22h14M19 2v6a7 7 0 0 1-14 0V2M5 22v-6a7 7 0 0 1 14 0v6" />
            </svg>
          </div>
          <div>
            <p className="text-headline-lg font-bold text-on-surface leading-none">
              {dashboard.waitingSessions.length}
            </p>
            <p className="text-label-sm font-semibold text-on-surface-variant leading-tight mt-1">
              Menunggu
            </p>
          </div>
        </div>
      </div>

      {/* Active Consultations List */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-headline-md font-bold text-on-surface">Konsultasi Aktif</h2>
          <Link href="/kader/konsultasi" className="text-label-md font-bold text-primary hover:underline">
            Lihat Semua
          </Link>
        </div>
        {dashboard.activeSessions.length === 0 ? (
          <p className="text-body-md text-on-surface-variant p-4 bg-surface-container-lowest rounded-2xl border border-outline-variant border-dashed text-center">
            Belum ada konsultasi aktif saat ini.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {dashboard.activeSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </div>

      {/* Waiting Sessions List */}
      <div>
        <h2 className="mb-4 text-headline-md font-bold text-on-surface">Menunggu</h2>
        {dashboard.waitingSessions.length === 0 ? (
          <p className="text-body-md text-on-surface-variant p-4 bg-surface-container-lowest rounded-2xl border border-outline-variant border-dashed text-center">
            Antrean kosong. Belum ada siswa baru yang menunggu.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {dashboard.waitingSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between gap-3 border border-outline-variant border-r-4 border-r-primary bg-surface-container-lowest p-sm rounded-2xl relative overflow-hidden shadow-xs hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3">
                  <div
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-outline-variant bg-surface-container text-on-surface-variant font-bold text-label-md"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <line x1="19" y1="8" x2="19" y2="14" />
                      <line x1="22" y1="11" x2="16" y2="11" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-body-md font-bold text-on-surface leading-tight">
                      {session.studentDisplayName}
                    </p>
                    <p className="text-label-sm text-on-surface-variant mt-1 leading-none">
                      {getWaitingDuration(session.startedAt)}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => handleAccept(session.id)}
                  disabled={acceptingId === session.id || isPending}
                  className="py-1.5 px-4 text-label-sm rounded-lg"
                >
                  {acceptingId === session.id ? "Menerima..." : "Terima"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
