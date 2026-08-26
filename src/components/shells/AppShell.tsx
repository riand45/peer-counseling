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
};

export function AppShell({ title, navItems, primaryAction, children }: AppShellProps) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

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
