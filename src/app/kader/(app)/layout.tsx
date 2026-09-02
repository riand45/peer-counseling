import type { ReactNode } from "react";

export default function KaderAppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-container flex justify-center items-stretch">
      <div className="w-full max-w-[480px] bg-surface flex flex-col relative">
        {children}
      </div>
    </div>
  );
}
