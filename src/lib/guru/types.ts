import type { SessionStatus } from "@/lib/kader/types";
import type { Topic } from "@/lib/student/types";

export type ConsultationCounts = {
  total: number;
  active: number;
  waiting: number;
  ended: number;
};

export type AttentionItem = {
  sessionId: string;
  kind: "escalation" | "report";
  studentDisplayName: string;
  detail: string;
  createdAt: string;
};

export type ActivityItem = {
  sessionId: string;
  studentDisplayName: string;
  topics: Topic[];
  assignedKaderName: string | null;
  status: SessionStatus;
  lastMessageAt: string | null;
};

export type GuruDashboard = {
  fullName: string;
  counts: ConsultationCounts;
  attention: AttentionItem[];
  activity: ActivityItem[];
};

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  waiting: "Menunggu",
  active: "Berlangsung",
  escalated: "Eskalasi",
  ended: "Selesai",
};

export const SESSION_STATUS_TONES: Record<SessionStatus, "primary" | "error" | "neutral"> = {
  waiting: "neutral",
  active: "primary",
  escalated: "error",
  ended: "neutral",
};

export type ConsultationListItem = {
  sessionId: string;
  studentDisplayName: string;
  topics: Topic[];
  assignedKaderName: string | null;
  status: SessionStatus;
  createdAt: string;
};

export type ConsultationListResult = {
  items: ConsultationListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ConsultationDetail = {
  sessionId: string;
  studentDisplayName: string;
  assignedKaderName: string | null;
  hasTakenOver: boolean;
  topics: Topic[];
  status: SessionStatus;
  createdAt: string;
};
