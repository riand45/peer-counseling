"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NotificationModal } from "./NotificationModal";
import { HelpModal } from "./HelpModal";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

type AppShellProps = {
  title: string;
  navItems: NavItem[];
  primaryAction?: ReactNode;
  children: ReactNode;
  layoutMode?: "mobile" | "desktop";
};

export function AppShell({
  title,
  navItems,
  primaryAction,
  children,
  layoutMode = "desktop",
}: AppShellProps) {
  const pathname = usePathname();
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isActive = (href: string) => {
    if (pathname === href) return true;

    // Special cases for Chat screens so they activate their corresponding home/chat tabs
    if (href === "/student/cerita-saya" && pathname.startsWith("/student/chat/")) {
      return true;
    }
    if (href === "/kader" && pathname.startsWith("/kader/chat/")) {
      return true;
    }

    // Generic subpath matching, ensuring we don't activate a base route if a more specific navItem matches
    if (pathname.startsWith(`${href}/`)) {
      const matchesOtherNavItem = navItems.some(
        (item) => item.href !== href && (pathname === item.href || pathname.startsWith(`${item.href}/`))
      );
      return !matchesOtherNavItem;
    }

    return false;
  };

  if (layoutMode === "mobile") {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-surface">
        {/* Mobile-style Top Header */}
        <header className="flex h-14 items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-sm py-3 w-full shrink-0 animate-fade-in">
          <div>
            <Link href={pathname.startsWith("/kader") ? "/kader" : "/student/cerita-saya"} className="text-headline-md font-bold text-primary hover:opacity-90">
              Ruang Cerita
            </Link>
          </div>
          <div className="flex items-center gap-1">
            {/* Bell Icon */}
            <button
              type="button"
              onClick={() => setNotificationOpen(true)}
              className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-container-low text-on-surface-variant transition-colors"
              aria-label="Notifikasi"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-error" />
                </span>
              )}
            </button>

            {/* Help/Question Icon */}
            <button
              type="button"
              onClick={() => setHelpOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-container-low text-on-surface-variant transition-colors"
              aria-label="Bantuan"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>

            {/* Profile Avatar */}
            {pathname.startsWith("/kader") ? (
              <Link
                href="/kader/profil"
                className="flex h-8 w-8 ml-1 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container text-label-sm font-bold hover:opacity-90 shadow-xs border border-outline-variant select-none"
                aria-label="Profil"
              >
                K
              </Link>
            ) : (
              <Link
                href="/student/profil"
                className="flex h-8 w-8 ml-1 items-center justify-center rounded-full bg-surface-container-highest text-label-sm hover:opacity-90 shadow-xs border border-outline-variant select-none"
                aria-label="Profil Anonim"
              >
                👤
              </Link>
            )}
          </div>
        </header>

        {/* Scrollable Content Container */}
        <main className="flex-1 overflow-y-auto p-sm">
          {children}
        </main>

        {/* Material 3 Bottom Navigation Bar */}
        <nav className="flex h-20 w-full shrink-0 items-center justify-around border-t border-outline-variant bg-surface-container-lowest px-2 pb-safe">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-1 flex-col items-center justify-center gap-1 h-full text-label-sm select-none"
              >
                <div
                  className={cn(
                    "flex h-8 w-14 items-center justify-center rounded-full transition-all duration-200",
                    active
                      ? "bg-secondary-container text-on-secondary-container scale-105 shadow-sm"
                      : "text-on-surface-variant hover:bg-surface-container-low"
                  )}
                >
                  <span className="text-body-lg leading-none">{item.icon}</span>
                </div>
                <span
                  className={cn(
                    "text-label-sm transition-all duration-200",
                    active ? "font-semibold text-on-surface" : "text-on-surface-variant"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Notification and Help Modals */}
        <NotificationModal
          open={notificationOpen}
          onClose={() => setNotificationOpen(false)}
          onUnreadCountChange={setUnreadCount}
        />
        <HelpModal
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
        />
      </div>
    );
  }

  // Desktop/Default Layout (For Guru BK)
  return (
    <div className="flex min-h-screen bg-surface">
      {/* ── Premium Guru Sidebar (desktop) ─────────────────── */}
      <aside
        className={cn(
          "hidden md:flex flex-col",
          "w-72 shrink-0",
          "bg-gradient-to-b from-[hsl(220,30%,10%)] via-[hsl(230,25%,13%)] to-[hsl(240,20%,11%)]",
          "border-r border-white/[0.06]",
          "shadow-[4px_0_32px_rgba(0,0,0,0.35)]",
          "overflow-hidden relative",
        )}
      >
        {/* Glow blobs */}
        <div aria-hidden="true" className="pointer-events-none absolute -top-20 -left-10 h-56 w-56 rounded-full bg-tertiary/20 blur-3xl opacity-60" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-20 -right-12 h-40 w-40 rounded-full bg-primary/15 blur-3xl opacity-50" />

        {/* Brand header */}
        <div className="relative z-10 flex items-center gap-3 px-6 pt-8 pb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-tertiary to-tertiary/70 shadow-lg shadow-tertiary/30">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </div>
          <div>
            <p className="text-base font-bold leading-tight text-white">Ruang Cerita</p>
            <p className="text-[11px] font-medium text-white/40 uppercase tracking-widest">{title}</p>
          </div>
        </div>

        <div className="mx-6 mb-5 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        <nav className="relative z-10 flex flex-1 flex-col gap-1 px-3" aria-label="Navigasi utama">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                  active ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:bg-white/[0.07] hover:text-white/80",
                )}
              >
                {active && (
                  <span aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 rounded-r-full bg-gradient-to-b from-tertiary to-tertiary/60 shadow-[0_0_8px_2px_rgba(0,180,160,0.4)]" />
                )}
                <span className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base transition-all duration-200",
                  active ? "bg-tertiary/20 text-tertiary shadow-sm" : "text-white/40 group-hover:bg-white/[0.06] group-hover:text-white/70",
                )}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="relative z-10 mt-auto px-3 pb-6 pt-4">
          <div className="mb-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <button
            type="button"
            onClick={() => setNotificationOpen(true)}
            className="group relative flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium text-white/50 transition-all duration-200 hover:bg-white/[0.07] hover:text-white/80"
            aria-label="Notifikasi"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-all group-hover:bg-white/[0.06] group-hover:text-white/70">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </span>
            <span>Notifikasi</span>
            {unreadCount > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-white">{unreadCount}</span>
            )}
          </button>
          {primaryAction && (
            <div className="mt-1 [&_button]:w-full [&_button]:rounded-xl [&_button]:px-4 [&_button]:py-3 [&_button]:text-sm [&_button]:font-medium [&_button]:text-white/50 [&_button]:transition-all [&_button]:duration-200 hover:[&_button]:bg-white/[0.07] hover:[&_button]:text-white/80">
              {primaryAction}
            </div>
          )}
        </div>
      </aside>

      {/* ── Mobile Drawer (hamburger) ─────────────────────────── */}
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={() => setDrawerOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-300 md:hidden",
          drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
        )}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu navigasi"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col md:hidden",
          "bg-gradient-to-b from-[hsl(220,30%,10%)] via-[hsl(230,25%,13%)] to-[hsl(240,20%,11%)]",
          "shadow-[8px_0_40px_rgba(0,0,0,0.5)] overflow-hidden",
          "transition-transform duration-300 ease-in-out",
          drawerOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Glow blobs */}
        <div aria-hidden="true" className="pointer-events-none absolute -top-16 -left-8 h-48 w-48 rounded-full bg-tertiary/20 blur-3xl opacity-60" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-16 -right-10 h-36 w-36 rounded-full bg-primary/15 blur-3xl opacity-50" />

        {/* Drawer header */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-7 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-tertiary to-tertiary/70 shadow-lg shadow-tertiary/30">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-white">Ruang Cerita</p>
              <p className="text-[10px] font-medium text-white/40 uppercase tracking-widest">{title}</p>
            </div>
          </div>
          {/* Close button */}
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Tutup menu"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white/80"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="mx-5 mb-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* Drawer nav */}
        <nav className="relative z-10 flex flex-1 flex-col gap-1 overflow-y-auto px-3" aria-label="Navigasi utama">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  "group relative flex items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                  active ? "bg-white/10 text-white shadow-sm" : "text-white/50 hover:bg-white/[0.07] hover:text-white/80",
                )}
              >
                {active && (
                  <span aria-hidden="true" className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-7 rounded-r-full bg-gradient-to-b from-tertiary to-tertiary/60 shadow-[0_0_8px_2px_rgba(0,180,160,0.4)]" />
                )}
                <span className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base transition-all duration-200",
                  active ? "bg-tertiary/20 text-tertiary shadow-sm" : "text-white/40 group-hover:bg-white/[0.06] group-hover:text-white/70",
                )}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Drawer bottom */}
        <div className="relative z-10 px-3 pb-8 pt-4">
          <div className="mb-4 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          <button
            type="button"
            onClick={() => { setNotificationOpen(true); setDrawerOpen(false); }}
            className="group relative flex w-full items-center gap-3.5 rounded-xl px-4 py-3 text-sm font-medium text-white/50 transition-all duration-200 hover:bg-white/[0.07] hover:text-white/80"
            aria-label="Notifikasi"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition-all group-hover:bg-white/[0.06] group-hover:text-white/70">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </span>
            <span>Notifikasi</span>
            {unreadCount > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-error px-1.5 text-[10px] font-bold text-white">{unreadCount}</span>
            )}
          </button>
          {primaryAction && (
            <div className="mt-1 [&_button]:w-full [&_button]:rounded-xl [&_button]:px-4 [&_button]:py-3 [&_button]:text-sm [&_button]:font-medium [&_button]:text-white/50 [&_button]:transition-all [&_button]:duration-200 hover:[&_button]:bg-white/[0.07] hover:[&_button]:text-white/80">
              {primaryAction}
            </div>
          )}
        </div>
      </div>

      {/* Main content column */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Mobile top bar with hamburger (hidden on md+) */}
        <header className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest/95 backdrop-blur-md px-4 py-3 md:hidden sticky top-0 z-30">
          {/* Hamburger button */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Buka menu"
            aria-expanded={drawerOpen}
            className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-surface-container-low text-on-surface-variant transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>

          <p className="text-base font-bold text-on-surface">Ruang Cerita</p>

          {/* Right icons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setNotificationOpen(true)}
              className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-container-low text-on-surface-variant transition-colors"
              aria-label="Notifikasi"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-error" />
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 p-sm md:p-lg">{children}</main>

        {/* Notification and Help Modals */}
        <NotificationModal
          open={notificationOpen}
          onClose={() => setNotificationOpen(false)}
          onUnreadCountChange={setUnreadCount}
        />
        <HelpModal
          open={helpOpen}
          onClose={() => setHelpOpen(false)}
        />
      </div>
    </div>
  );
}

