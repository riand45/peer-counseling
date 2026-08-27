import { describe, expect, it } from "vitest";
import { getStudentDisplayName, AVATAR_SEED_LABELS } from "@/lib/student/types";

describe("getStudentDisplayName", () => {
  it("uses the nickname when one is set", () => {
    expect(getStudentDisplayName("Sahabat Langit", "kucing")).toBe("Sahabat Langit");
  });

  it("trims whitespace-only nicknames and falls back", () => {
    expect(getStudentDisplayName("   ", "kucing")).toBe("Anonim_Kucing");
  });

  it("falls back to Anonim_<AvatarLabel> when there is no nickname", () => {
    expect(getStudentDisplayName(null, "rubah")).toBe("Anonim_Rubah");
    expect(getStudentDisplayName(undefined, "panda")).toBe("Anonim_Panda");
  });

  it("falls back to a generic label when avatarSeed is missing or unknown", () => {
    expect(getStudentDisplayName(null, null)).toBe("Anonim_Siswa");
    expect(getStudentDisplayName(undefined, "unknown-seed")).toBe("Anonim_Siswa");
  });

  it("has a label for every seed used by randomAvatarSeed", () => {
    expect(Object.keys(AVATAR_SEED_LABELS).length).toBeGreaterThan(0);
    for (const key of Object.keys(AVATAR_SEED_LABELS)) {
      expect(typeof AVATAR_SEED_LABELS[key]).toBe("string");
    }
  });
});
