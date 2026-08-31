import type { SessionStatus } from "@/lib/kader/types";

export type Topic =
  | "pertemanan"
  | "bullying"
  | "keluarga"
  | "akademik"
  | "perasaan"
  | "lingkungan_sekolah"
  | "lainnya";

export const TOPICS: Topic[] = [
  "pertemanan",
  "bullying",
  "keluarga",
  "akademik",
  "perasaan",
  "lingkungan_sekolah",
  "lainnya",
];

export const TOPIC_LABELS: Record<Topic, string> = {
  pertemanan: "Pertemanan",
  bullying: "Bullying",
  keluarga: "Keluarga",
  akademik: "Akademik",
  perasaan: "Perasaan",
  lingkungan_sekolah: "Lingkungan Sekolah",
  lainnya: "Lainnya",
};

export const TOPIC_EMOJI: Record<Topic, string> = {
  pertemanan: "🤝",
  bullying: "🛡️",
  keluarga: "🏡",
  akademik: "📚",
  perasaan: "💭",
  lingkungan_sekolah: "🏫",
  lainnya: "✨",
};

export type KaderStatus = "available" | "busy" | "offline";

export type KaderSummary = {
  id: string;
  fullName: string;
  avatarSeed?: string | null;
  bio: string | null;
  topics: Topic[];
  status: KaderStatus;
};

export const AVATAR_SEED_LABELS: Record<string, string> = {
  kucing: "Kucing",
  kelinci: "Kelinci",
  rubah: "Rubah",
  beruang: "Beruang",
  burung: "Burung",
  rusa: "Rusa",
  panda: "Panda",
  koala: "Koala",
};

export function getStudentDisplayName(
  nickname: string | null | undefined,
  avatarSeed: string | null | undefined,
): string {
  const trimmed = nickname?.trim();
  if (trimmed) return trimmed;
  const label = avatarSeed ? AVATAR_SEED_LABELS[avatarSeed] : undefined;
  return `Anonim_${label ?? "Siswa"}`;
}

export type StudentSessionSummary = {
  id: string;
  topics: Topic[];
  kaderName: string | null;
  kaderAvatarSeed?: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  status: SessionStatus;
};

export type ReportReason = "uncomfortable" | "unresponsive" | "need_teacher" | "other";

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  uncomfortable: "Saya merasa tidak nyaman",
  unresponsive: "Kader tidak merespons",
  need_teacher: "Saya ingin bantuan guru/BK",
  other: "Lainnya",
};

export type StudentProfile = {
  nickname: string | null;
  avatarSeed: string;
};
