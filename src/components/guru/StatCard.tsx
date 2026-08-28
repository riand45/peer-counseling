import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string | number }) {
  return (
    <Card className="flex flex-col gap-3">
      <div
        aria-hidden="true"
        className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary-container text-lg text-on-secondary-container"
      >
        {icon}
      </div>
      <div>
        <p className="text-label-md text-on-surface-variant">{label}</p>
        <p className="text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">{value}</p>
      </div>
    </Card>
  );
}
