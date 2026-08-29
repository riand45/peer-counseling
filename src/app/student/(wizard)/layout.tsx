"use client";

import { useRouter, usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { StoryWizardProvider } from "./wizard-context";

const STEP_BY_PATH: Record<string, number> = {
  "/student/topik": 1,
  "/student/kader": 2,
  "/student/konfirmasi": 3,
};

function StepHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const step = STEP_BY_PATH[pathname] ?? 1;

  return (
    <header className="border-b border-outline-variant bg-surface-container-lowest px-sm py-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Kembali"
          className="text-headline-md text-on-surface-variant"
        >
          ←
        </button>
        <p className="text-label-md font-semibold text-on-surface">Ruang Cerita</p>
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Tutup"
          className="text-headline-md text-on-surface-variant"
        >
          ✕
        </button>
      </div>
      <p className="mt-2 text-label-sm text-on-surface-variant">Langkah {step} dari 3</p>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${(step / 3) * 100}%` }}
        />
      </div>
    </header>
  );
}

export default function WizardLayout({ children }: { children: ReactNode }) {
  return (
    <StoryWizardProvider>
      <main className="min-h-screen bg-surface">
        <StepHeader />
        <div className="mx-auto max-w-[36rem] p-sm">{children}</div>
      </main>
    </StoryWizardProvider>
  );
}
