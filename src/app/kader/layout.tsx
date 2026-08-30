import type { ReactNode } from "react";

export default function KaderRootLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-container flex justify-center items-stretch">
      <div className="w-full max-w-[480px] bg-surface flex flex-col shadow-2xl border-x border-outline-variant relative">
        {children}
      </div>
    </div>
  );
}
