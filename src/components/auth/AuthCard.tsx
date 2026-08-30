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
    <div className="rounded-2xl border border-outline-variant/60 bg-surface-container-lowest/90 p-8 shadow-[0_24px_60px_-16px_rgba(0,93,167,0.2)] backdrop-blur-md">
      {/* Icon */}
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-2xl shadow-md",
          iconBg,
        )}
      >
        {icon}
      </div>

      {/* Heading */}
      <h1 className="mt-5 text-headline-md font-bold text-on-surface">{title}</h1>
      <p className="mt-1 text-body-md text-on-surface-variant">{subtitle}</p>

      {/* Feedback */}
      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-error/30 bg-error-container/70 px-3.5 py-3 text-label-md text-on-error-container">
          <span aria-hidden="true" className="mt-0.5 shrink-0 text-base">⚠️</span>
          <span>{error}</span>
        </div>
      )}
      {message === "confirm-email" && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-secondary/30 bg-secondary-container/40 px-3.5 py-3 text-label-md text-on-secondary-container">
          <span aria-hidden="true" className="mt-0.5 shrink-0 text-base">📧</span>
          <span>Pendaftaran berhasil — cek email Anda untuk konfirmasi sebelum masuk.</span>
        </div>
      )}

      {children}
    </div>
  );
}
