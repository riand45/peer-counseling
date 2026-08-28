import { describe, expect, it } from "vitest";
import { AVATAR_EMOJI, nextAvatarSeed } from "@/lib/student/avatars";
import { AVATAR_SEED_LABELS } from "@/lib/student/types";

describe("AVATAR_EMOJI", () => {
  it("has an emoji for every seed in AVATAR_SEED_LABELS", () => {
    for (const seed of Object.keys(AVATAR_SEED_LABELS)) {
      expect(AVATAR_EMOJI[seed]).toBeTruthy();
    }
  });
});

describe("nextAvatarSeed", () => {
  it("cycles to the next seed in order", () => {
    const seeds = Object.keys(AVATAR_SEED_LABELS);
    expect(nextAvatarSeed(seeds[0])).toBe(seeds[1]);
  });

  it("wraps around from the last seed back to the first", () => {
    const seeds = Object.keys(AVATAR_SEED_LABELS);
    expect(nextAvatarSeed(seeds[seeds.length - 1])).toBe(seeds[0]);
  });

  it("starts at the first seed when given an unknown seed", () => {
    const seeds = Object.keys(AVATAR_SEED_LABELS);
    expect(nextAvatarSeed("unknown-seed")).toBe(seeds[0]);
  });
});
