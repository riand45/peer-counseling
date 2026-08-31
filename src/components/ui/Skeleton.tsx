import { cn } from "@/lib/cn";

/** A single shimmer block. Pass `className` for width, height, and shape. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-surface-container-high",
        className
      )}
    />
  );
}

/** Stack of shimmer lines that mimic a block of text. */
export function SkeletonText({
  lines = 2,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3.5 rounded-full",
            i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

/** A card-shaped shimmer wrapper — matches the Card component's padding. */
export function SkeletonCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-2xl border border-outline-variant bg-surface-container-lowest p-sm",
        className
      )}
    >
      {children}
    </div>
  );
}
