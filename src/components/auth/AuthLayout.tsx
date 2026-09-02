import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type AuthLayoutProps = {
  children: ReactNode;
  accent: "primary" | "tertiary";
  /** Decorative blob color class for background gradient */
  blobClass?: string;
};

const accentConfig: Record<
  AuthLayoutProps["accent"],
  { panelGrad: string; blob1: string; blob2: string; tag: string }
> = {
  primary: {
    panelGrad: "from-[hsl(220,50%,14%)] via-[hsl(215,45%,18%)] to-[hsl(210,40%,12%)]",
    blob1: "bg-primary/30",
    blob2: "bg-secondary/20",
    tag: "Portal Konselor",
  },
  tertiary: {
    panelGrad: "from-[hsl(210,40%,10%)] via-[hsl(220,35%,14%)] to-[hsl(230,30%,11%)]",
    blob1: "bg-tertiary/25",
    blob2: "bg-primary/15",
    tag: "Area Guru",
  },
};

export function AuthLayout({ children, accent, blobClass }: AuthLayoutProps) {
  const cfg = accentConfig[accent];

  return (
    <div className="flex min-h-screen">
      {/* ── Left decorative panel (desktop only) ────────────── */}
      <div
        className={cn(
          "hidden lg:flex lg:w-[44%] xl:w-[40%] flex-col justify-between",
          "bg-gradient-to-br",
          cfg.panelGrad,
          "relative overflow-hidden px-12 py-14",
        )}
        aria-hidden="true"
      >
        {/* Decorative blobs */}
        <div
          className={cn(
            "pointer-events-none absolute -top-24 -left-16 h-72 w-72 rounded-full opacity-40 blur-3xl",
            blobClass ?? cfg.blob1,
          )}
        />
        <div
          className={cn(
            "pointer-events-none absolute -bottom-20 -right-12 h-56 w-56 rounded-full opacity-30 blur-3xl",
            cfg.blob2,
          )}
        />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-white/[0.02] blur-2xl" />

        {/* Logo */}
        <div className="relative z-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <span className="text-lg font-bold text-white/90">Ruang Cerita</span>
          </Link>
        </div>

        {/* Hero copy */}
        <div className="relative z-10 max-w-xs">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-white/50">
            <span className="h-1.5 w-1.5 rounded-full bg-tertiary" />
            {cfg.tag}
          </div>
          <h1 className="text-4xl font-bold leading-tight text-white">
            Temani dan dampingi
            <br />
            <span className="bg-gradient-to-r from-tertiary via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              setiap perjalanan
            </span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-white/45">
            Platform konseling berbasis empati untuk mendukung kesehatan mental siswa secara holistik.
          </p>
        </div>

        {/* Testimonial / quote card */}
        <div className="relative z-10">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.05] px-5 py-4 backdrop-blur-sm">
            <p className="text-sm leading-relaxed text-white/60">
              &ldquo;Mendengar adalah awal dari segalanya.&rdquo;
            </p>
            <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-white/30">
              — Prinsip Konseling
            </p>
          </div>
        </div>
      </div>

      {/* ── Right form panel ─────────────────────────────────── */}
      <main
        className={cn(
          "flex flex-1 flex-col items-center justify-center",
          "bg-gradient-to-br from-surface via-surface to-surface-container-low",
          "relative overflow-hidden px-sm py-12",
        )}
      >
        {/* Subtle mobile blobs */}
        <div
          className={cn(
            "pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-20 blur-3xl lg:hidden",
            blobClass ?? cfg.blob1,
          )}
        />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-secondary/15 opacity-20 blur-3xl lg:hidden" />

        {/* Back link - mobile only */}
        <div className="relative z-10 w-full max-w-[26rem] lg:hidden">
          <Link
            href="/"
            className="group mb-6 inline-flex items-center gap-2 text-label-md font-semibold text-on-surface-variant transition-colors hover:text-primary"
          >
            <span className="transition-transform group-hover:-translate-x-1">←</span>
            Kembali ke Halaman Utama
          </Link>
        </div>

        <div className="relative z-10 w-full max-w-[26rem]">
          {/* Desktop: small back link above card */}
          <div className="hidden lg:block mb-5">
            <Link
              href="/"
              className="group inline-flex items-center gap-2 text-label-sm font-medium text-on-surface-variant/70 transition-colors hover:text-on-surface"
            >
              <span className="transition-transform group-hover:-translate-x-1">←</span>
              Kembali
            </Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
