import { AVATAR_SEED_LABELS } from "./types";

export const AVATAR_EMOJI: Record<string, string> = {
  kucing: "🐱",
  kelinci: "🐰",
  rubah: "🦊",
  beruang: "🐻",
  burung: "🐦",
  rusa: "🦌",
  panda: "🐼",
  koala: "🐨",
};

const AVATAR_SEEDS = Object.keys(AVATAR_SEED_LABELS);

export function nextAvatarSeed(current: string): string {
  const index = AVATAR_SEEDS.indexOf(current);
  const nextIndex = index === -1 ? 0 : (index + 1) % AVATAR_SEEDS.length;
  return AVATAR_SEEDS[nextIndex];
}
