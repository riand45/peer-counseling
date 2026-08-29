import { cn } from "@/lib/cn";
import { AVATAR_EMOJI } from "@/lib/student/avatars";

export function AvatarIcon({ seed, className }: { seed: string; className?: string }) {
  const emoji = AVATAR_EMOJI[seed] ?? "🙂";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex h-28 w-28 items-center justify-center rounded-full bg-secondary-fixed text-6xl",
        className,
      )}
    >
      {emoji}
    </div>
  );
}
