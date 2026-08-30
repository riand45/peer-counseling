"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

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
              className="relative flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-container-low text-on-surface-variant transition-colors"
              aria-label="Notifikasi"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              <span className="absolute top-2.5 right-2.5 h-1.5 w-1.5 rounded-full bg-error" />
            </button>

            {/* Help/Question Icon */}
            <button
              type="button"
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
      </div>
    );
  }

  // Desktop/Default Layout (For Guru BK)
  return (
    <div className="flex min-h-screen bg-surface">
      <aside className="hidden w-64 flex-col gap-6 border-r border-outline-variant bg-surface-container-low p-md md:flex">
        <div>
          <p className="text-headline-md font-bold text-on-surface">Ruang Cerita</p>
          <p className="text-label-sm text-on-surface-variant">{title}</p>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-label-md",
                isActive(item.href)
                  ? "bg-secondary-container text-on-secondary-container"
                  : "text-on-surface-variant hover:bg-surface-container",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
        {primaryAction && <div className="mt-auto">{primaryAction}</div>}
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest px-sm py-3 md:hidden">
          <p className="text-headline-md font-bold text-on-surface">Ruang Cerita</p>
        </header>

        <main className="flex-1 p-sm md:p-lg">{children}</main>

        <nav className="flex items-center justify-around border-t border-outline-variant bg-surface-container-lowest p-2 md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md px-3 py-1 text-label-sm",
                isActive(item.href) ? "text-primary" : "text-on-surface-variant",
              )}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
