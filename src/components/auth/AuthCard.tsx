import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type AuthCardProps = {
  icon: ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  error?: string;
  message?: string;
  children: ReactNode;
};

export function AuthCard({ icon, iconBg, title, subtitle, error, message, children }: AuthCardProps) {
  return (
    <div className="rounded-3xl border border-outline-variant/60 bg-surface/90 p-8 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.12),0_4px_16px_-4px_rgba(0,0,0,0.06)] backdrop-blur-xl ring-1 ring-white/60">
      {/* Icon */}
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl shadow-lg",
          iconBg,
        )}
      >
        {icon}
      </div>

      {/* Heading */}
      <h1 className="mt-5 text-2xl font-bold tracking-tight text-on-surface">{title}</h1>
      <p className="mt-1.5 text-sm text-on-surface-variant">{subtitle}</p>

      {/* Feedback */}
      {error && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-error/25 bg-error-container/60 px-4 py-3.5 text-sm text-on-error-container shadow-sm">
          <span aria-hidden="true" className="mt-0.5 shrink-0">⚠️</span>
          <span>{error}</span>
        </div>
      )}
      {message === "confirm-email" && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-secondary/25 bg-secondary-container/50 px-4 py-3.5 text-sm text-on-secondary-container shadow-sm">
          <span aria-hidden="true" className="mt-0.5 shrink-0">📧</span>
          <span>Pendaftaran berhasil — cek email Anda untuk konfirmasi sebelum masuk.</span>
        </div>
      )}

      {children}
    </div>
  );
}
