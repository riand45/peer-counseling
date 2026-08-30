import type { ReactNode } from "react";

export default function StudentRootLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex justify-center items-stretch">
      <div className="w-full max-w-[480px] flex flex-col relative">
        {children}
      </div>
    </div>
  );
}
