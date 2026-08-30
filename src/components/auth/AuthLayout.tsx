import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type AuthLayoutProps = {
  children: ReactNode;
  accent: "primary" | "tertiary";
  /** Decorative blob color class for background gradient */
  blobClass?: string;
};

const accentBg: Record<AuthLayoutProps["accent"], string> = {
  primary: "from-primary/[0.06] via-surface to-secondary/[0.04]",
  tertiary: "from-tertiary/[0.08] via-surface to-primary/[0.04]",
};

export function AuthLayout({ children, accent, blobClass }: AuthLayoutProps) {
  return (
    <main
      className={cn(
        "relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br p-sm",
        accentBg[accent],
      )}
    >
      {/* Decorative blobs */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -top-32 -right-32 h-[500px] w-[500px] rounded-full opacity-30 blur-3xl",
          blobClass ?? (accent === "primary" ? "bg-primary/30" : "bg-tertiary/30"),
        )}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-32 h-[400px] w-[400px] rounded-full bg-secondary/20 opacity-25 blur-3xl"
      />

      <div className="relative w-full max-w-[28rem]">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-outline-variant/50 bg-surface-container-lowest/80 px-4 py-2 text-label-md font-semibold text-on-surface-variant backdrop-blur-sm transition-all hover:bg-surface-container-low hover:text-on-surface"
        >
          <span aria-hidden="true">←</span> Ruang Cerita
        </Link>

        {children}
      </div>
    </main>
  );
}
