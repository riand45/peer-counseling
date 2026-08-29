import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import type { KaderSummary } from "@/lib/student/types";

export function TransferKaderCard({
  kader,
  onSelect,
}: {
  kader: KaderSummary;
  onSelect: (kader: KaderSummary) => void;
}) {
  const initial = kader.fullName.trim().charAt(0).toUpperCase() || "K";

  return (
    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-fixed text-headline-md font-bold text-on-secondary-fixed"
        >
          {initial}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-label-md font-semibold text-on-surface">Kak {kader.fullName}</p>
            <Chip tone="primary">Tersedia</Chip>
          </div>
          {kader.bio && (
            <p className="mt-1 line-clamp-2 text-body-md text-on-surface-variant">{kader.bio}</p>
          )}
        </div>
      </div>
      <Button onClick={() => onSelect(kader)} className="shrink-0">
        Pilih &amp; Alihkan
      </Button>
    </Card>
  );
}
