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
  bio: string | null;
  topics: Topic[];
  status: KaderStatus;
};
