"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { updateKaderStatus } from "@/lib/kader/actions";
import type { KaderStatus } from "@/lib/student/types";

const STATUS_OPTIONS: { value: KaderStatus; label: string }[] = [
  { value: "available", label: "Tersedia" },
  { value: "busy", label: "Sibuk" },
  { value: "offline", label: "Offline" },
];

export function StatusToggle({ status }: { status: KaderStatus }) {
  const [current, setCurrent] = useState(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSelect(next: KaderStatus) {
    if (next === current) return;
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      try {
        await updateKaderStatus(next);
      } catch (err) {
        setCurrent(previous);
        setError(err instanceof Error ? err.message : "Gagal memperbarui status");
      }
    });
  }

  return (
    <div>
      <div className="inline-flex rounded-full border border-outline-variant bg-surface-container-low p-1">
        {STATUS_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={pending}
            onClick={() => handleSelect(option.value)}
            className={cn(
              "rounded-full px-4 py-2 text-label-md font-semibold transition-colors disabled:opacity-50",
              current === option.value
                ? "bg-primary text-on-primary shadow-sm"
                : "text-on-surface-variant hover:bg-surface-variant",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      {error && <p className="mt-2 text-label-sm text-error">{error}</p>}
    </div>
  );
}
