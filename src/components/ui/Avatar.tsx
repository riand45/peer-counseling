import { cn } from "@/lib/cn";
import { AVATAR_EMOJI } from "@/lib/student/avatars";

/**
 * Renders the student's animal emoji avatar inside a styled circle.
 * Used in chat bubbles (kader & guru views) and session cards.
 */
export function StudentEmojiAvatar({
  avatarSeed,
  size = "sm",
  className,
}: {
  avatarSeed: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const emoji = avatarSeed ? (AVATAR_EMOJI[avatarSeed] ?? "🙂") : "🙂";

  const sizeClasses = {
    sm: "h-8 w-8 text-lg",
    md: "h-10 w-10 text-xl",
    lg: "h-14 w-14 text-2xl",
  };

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-secondary-fixed",
        sizeClasses[size],
        className,
      )}
    >
      {emoji}
    </div>
  );
}

/** Deterministic color palette for kader/guru initials avatar */
const AVATAR_COLORS = [
  { bg: "bg-primary-fixed", text: "text-on-primary-fixed" },
  { bg: "bg-secondary-fixed", text: "text-on-secondary-fixed" },
  { bg: "bg-tertiary-fixed", text: "text-on-tertiary-fixed" },
  { bg: "bg-primary-container", text: "text-on-primary-container" },
  { bg: "bg-secondary-container", text: "text-on-secondary-container" },
  { bg: "bg-tertiary-container", text: "text-on-tertiary-container" },
];

function pickColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Renders a styled initial-based avatar for kader or guru users
 * (they don't have emoji avatar seeds).
 */
export function KaderInitialAvatar({
  fullName,
  size = "sm",
  className,
}: {
  fullName: string | undefined | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const name = fullName?.trim() || "K";
  const initial = name.charAt(0).toUpperCase();
  const color = pickColor(name);

  const sizeClasses = {
    sm: "h-8 w-8 text-label-sm",
    md: "h-10 w-10 text-label-md",
    lg: "h-12 w-12 text-title-md",
    xl: "h-20 w-20 text-headline-lg",
  };

  return (
    <div
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold",
        sizeClasses[size],
        color.bg,
        color.text,
        className,
      )}
    >
      {initial}
    </div>
  );
}
