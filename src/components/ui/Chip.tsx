import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type ChipTone = "primary" | "secondary" | "tertiary" | "error" | "neutral";

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: ChipTone;
};

const toneClasses: Record<ChipTone, string> = {
  primary: "bg-primary-fixed text-on-primary-fixed",
  secondary: "bg-secondary-fixed text-on-secondary-fixed",
  tertiary: "bg-tertiary-fixed text-on-tertiary-fixed",
  error: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-high text-on-surface-variant",
};

export function Chip({ tone = "neutral", className, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-label-sm font-medium",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
