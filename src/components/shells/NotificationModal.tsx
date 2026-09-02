"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { getStudentLocalId } from "@/lib/student/identity";
import { getStudentSessions } from "@/lib/student/actions";
import { getKaderDashboard } from "@/lib/kader/actions";
import type { StudentSessionSummary } from "@/lib/student/types";

export type NotificationCategory = "all" | "session" | "info";

export type NotificationItem = {
  id: string;
  category: "session" | "info";
  title: string;
  description: string;
  timestamp: string;
  href?: string;
  actionText?: string;
  iconType: "chat" | "alert" | "tip" | "system" | "check";
};

type NotificationModalProps = {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
};

const READ_STORAGE_KEY = "ruang-cerita:read-notifications";

function getStoredReadIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(READ_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(readIds: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(READ_STORAGE_KEY, JSON.stringify(Array.from(readIds)));
  } catch {
    // ignore
  }
}

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return "Baru saja";
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  if (diffMs < 0 || isNaN(diffMs)) return "Baru saja";

  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Baru saja";
  if (diffMins < 60) return `${diffMins} mnt lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays === 1) return "Kemarin";
  return `${diffDays} hari lalu`;
}

export function NotificationModal({
  open,
  onClose,
  onUnreadCountChange,
}: NotificationModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [filter, setFilter] = useState<NotificationCategory>("all");
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => getStoredReadIds());
  const [loading, setLoading] = useState(false);

  const isKader = pathname.startsWith("/kader");
  const isGuru = pathname.startsWith("/guru");
  const isStudent = !isKader && !isGuru;

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    const items: NotificationItem[] = [];

    if (isStudent) {
      const localId = getStudentLocalId();
      if (localId) {
        try {
          const sessions = await getStudentSessions({ studentLocalId: localId });
          const activeSessions = sessions.filter((s: StudentSessionSummary) => s.status === "active");
          const waitingSessions = sessions.filter((s: StudentSessionSummary) => s.status === "waiting");
          const recentEndedSessions = sessions.filter((s: StudentSessionSummary) => s.status === "ended");

          activeSessions.forEach((s: StudentSessionSummary) => {
            items.push({
              id: `student-session-active-${s.id}`,
              category: "session",
              title: "Sesi Konseling Sedang Berlangsung",
              description: `Sesi bersama ${s.kaderName ?? "Konselor Sebaya"} aktif. Ketuk untuk melanjutkan obrolan.`,
              timestamp: formatRelativeTime(s.lastMessageAt),
              href: `/student/chat/${s.id}`,
              actionText: "Buka Chat",
              iconType: "chat",
            });
          });

          waitingSessions.forEach((s: StudentSessionSummary) => {
            items.push({
              id: `student-session-waiting-${s.id}`,
              category: "session",
              title: "Menunggu Respons Konselor",
              description: `Permintaan ceritamu telah dikirim ke ${s.kaderName ?? "Konselor Sebaya"}. Mohon tunggu sejenak.`,
              timestamp: formatRelativeTime(s.lastMessageAt),
              href: `/student/chat/${s.id}`,
              actionText: "Lihat Status",
              iconType: "alert",
            });
          });

          if (recentEndedSessions.length > 0) {
            const latestEnded = recentEndedSessions[0];
            items.push({
              id: `student-session-ended-${latestEnded.id}`,
              category: "session",
              title: "Sesi Konseling Selesai",
              description: `Sesi bersama ${latestEnded.kaderName ?? "Konselor Sebaya"} telah diakhiri. Terima kasih telah berbagi cerita!`,
              timestamp: formatRelativeTime(latestEnded.lastMessageAt),
              href: `/student/chat/${latestEnded.id}`,
              actionText: "Lihat Ringkasan",
              iconType: "check",
            });
          }
        } catch (err) {
          console.error("Failed to load student notifications:", err);
        }
      }

      // Add educational and supportive tips
      items.push({
        id: "student-tip-relax",
        category: "info",
        title: "Tips Kesejahteraan Mental",
        description: "Luangkan waktu 5 menit untuk relaksasi atau mendengarkan lagu favoritmu saat merasa penat.",
        timestamp: "Hari ini",
        iconType: "tip",
      });

      items.push({
        id: "student-info-privacy",
        category: "info",
        title: "Kerahasiaan 100% Terjamin",
        description: "Seluruh percakapanmu di Ruang Cerita dijamin anonim dan rahasia bersama konselor sebaya terlatih.",
        timestamp: "Sistem",
        iconType: "system",
      });
    } else if (isKader) {
      try {
        const dashboard = await getKaderDashboard();
        const waitingSessions = dashboard.waitingSessions || [];
        const activeSessions = dashboard.activeSessions || [];

        waitingSessions.forEach((s) => {
          items.push({
            id: `kader-request-${s.id}`,
            category: "session",
            title: "Permintaan Sesi Baru",
            description: `Ada siswa anonim (${s.studentDisplayName}) ingin memulai sesi konseling.`,
            timestamp: formatRelativeTime(s.startedAt),
            href: `/kader`,
            actionText: "Tinjau Permintaan",
            iconType: "alert",
          });
        });

        activeSessions.forEach((s) => {
          items.push({
            id: `kader-active-${s.id}`,
            category: "session",
            title: "Sesi Konseling Aktif",
            description: `Anda memiliki sesi konsultasi aktif bersama ${s.studentDisplayName}.`,
            timestamp: formatRelativeTime(s.lastMessageAt),
            href: `/kader/chat/${s.id}`,
            actionText: "Lanjutkan Sesi",
            iconType: "chat",
          });
        });
      } catch (err) {
        console.error("Failed to load kader notifications:", err);
      }

      items.push({
        id: "kader-guideline-sop",
        category: "info",
        title: "Pedoman Pendampingan Sebaya",
        description: "Gunakan pendekatan empatik dan segera eskalasikan ke Guru BK jika terindikasi situasi krisis.",
        timestamp: "Sistem",
        iconType: "tip",
      });
    } else if (isGuru) {
      items.push({
        id: "guru-welcome",
        category: "info",
        title: "Portal Pengawasan Bimbingan Konseling",
        description: "Pantau ringkasan tren isu siswa dan eskalasi krisis dari konselor sebaya secara berkala.",
        timestamp: "Sistem",
        iconType: "system",
      });
    }

    setNotifications(items);
    setLoading(false);
  }, [isStudent, isKader, isGuru]);

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      if (isMounted) {
        await loadNotifications();
      }
    };
    run();
    return () => {
      isMounted = false;
    };
  }, [loadNotifications]);

  // Compute unread count and notify parent
  const unreadCount = useMemo(() => {
    return notifications.filter((item) => !readIds.has(item.id)).length;
  }, [notifications, readIds]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const markAllAsRead = () => {
    const newReadIds = new Set(readIds);
    notifications.forEach((item) => newReadIds.add(item.id));
    setReadIds(newReadIds);
    saveReadIds(newReadIds);
  };

  const handleNotificationClick = (item: NotificationItem) => {
    if (!readIds.has(item.id)) {
      const newReadIds = new Set(readIds);
      newReadIds.add(item.id);
      setReadIds(newReadIds);
      saveReadIds(newReadIds);
    }
    if (item.href) {
      onClose();
      router.push(item.href);
    }
  };

  const filteredNotifications = useMemo(() => {
    if (filter === "all") return notifications;
    return notifications.filter((item) => item.category === filter);
  }, [notifications, filter]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="notification-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full  rounded-2xl bg-surface-container-lowest shadow-2xl border border-outline-variant flex flex-col max-h-[80vh] overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline-variant bg-surface-container-lowest shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div>
              <h2 id="notification-title" className="text-label-lg font-bold text-on-surface flex items-center gap-1.5">
                Notifikasi
                {unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-error text-on-error">
                    {unreadCount}
                  </span>
                )}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-label-sm text-primary hover:text-primary/80 font-medium px-2 py-1 rounded-md hover:bg-primary/5 transition-colors"
                title="Tandai semua telah dibaca"
              >
                Tandai dibaca
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container-low text-on-surface-variant transition-colors"
              aria-label="Tutup"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 px-3.5 py-2 border-b border-outline-variant/60 bg-surface-container-low/50 shrink-0 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "px-2.5 py-1 rounded-full text-label-sm font-medium transition-all shrink-0",
              filter === "all"
                ? "bg-primary text-on-primary shadow-xs"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            Semua ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("session")}
            className={cn(
              "px-2.5 py-1 rounded-full text-label-sm font-medium transition-all shrink-0",
              filter === "session"
                ? "bg-primary text-on-primary shadow-xs"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            Sesi & Chat ({notifications.filter((n) => n.category === "session").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("info")}
            className={cn(
              "px-2.5 py-1 rounded-full text-label-sm font-medium transition-all shrink-0",
              filter === "info"
                ? "bg-primary text-on-primary shadow-xs"
                : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            Tips ({notifications.filter((n) => n.category === "info").length})
          </button>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 divide-y divide-outline-variant/20">
          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center text-center">
              <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin mb-2" />
              <p className="text-body-xs text-on-surface-variant">Memuat notifikasi...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="py-8 px-3 flex flex-col items-center justify-center text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-on-surface-variant mb-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <p className="text-label-md font-semibold text-on-surface">Belum ada notifikasi</p>
              <p className="text-body-xs text-on-surface-variant mt-0.5">
                {filter === "all"
                  ? "Pembaruan aktivitas & sesi akan muncul di sini."
                  : "Tidak ada notifikasi dalam kategori ini."}
              </p>
            </div>
          ) : (
            filteredNotifications.map((item) => {
              const isRead = readIds.has(item.id);
              return (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={cn(
                    "group relative flex items-start gap-2.5 p-2.5 rounded-xl transition-all pt-2.5",
                    item.href ? "cursor-pointer hover:bg-surface-container-low" : "hover:bg-surface-container-lowest",
                    !isRead ? "bg-primary-fixed/20 border border-primary-fixed/40" : "bg-surface-container-lowest"
                  )}
                >
                  {/* Icon Indicator */}
                  <div
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm",
                      item.iconType === "chat" && "bg-secondary-container text-on-secondary-container",
                      item.iconType === "alert" && "bg-error-container text-on-error-container",
                      item.iconType === "tip" && "bg-tertiary-fixed text-on-tertiary-fixed",
                      item.iconType === "system" && "bg-primary-fixed text-on-primary-fixed",
                      item.iconType === "check" && "bg-surface-container-highest text-on-surface"
                    )}
                  >
                    {item.iconType === "chat" && "💬"}
                    {item.iconType === "alert" && "🔔"}
                    {item.iconType === "tip" && "💡"}
                    {item.iconType === "system" && "🛡️"}
                    {item.iconType === "check" && "✓"}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1.5">
                      <h3
                        className={cn(
                          "text-label-md font-bold truncate",
                          !isRead ? "text-on-surface" : "text-on-surface-variant"
                        )}
                      >
                        {item.title}
                      </h3>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-on-surface-variant/80">{item.timestamp}</span>
                        {!isRead && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary inline-block" title="Belum dibaca" />
                        )}
                      </div>
                    </div>
                    <p className="text-body-xs text-on-surface-variant mt-0.5 leading-relaxed break-words">
                      {item.description}
                    </p>

                    {item.actionText && (
                      <div className="mt-1.5">
                        <span className="inline-flex items-center gap-0.5 text-label-sm font-semibold text-primary group-hover:underline">
                          {item.actionText}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-outline-variant/60 bg-surface-container-low/40 flex justify-between items-center text-body-xs text-on-surface-variant shrink-0">
          <span>Ruang Cerita • Layanan Konseling Sebaya</span>
          <button
            type="button"
            onClick={loadNotifications}
            className="text-label-sm text-primary hover:underline"
          >
            Segarkan
          </button>
        </div>
      </div>
    </div>
  );
}
