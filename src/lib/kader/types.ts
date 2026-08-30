import type { KaderStatus, Topic } from "@/lib/student/types";

export type KaderDashboardSession = {
  id: string;
  topics: Topic[];
  studentDisplayName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

export type KaderDashboardWaitingSession = {
  id: string;
  studentDisplayName: string;
  startedAt: string | null;
};

export type KaderDashboard = {
  fullName: string;
  status: KaderStatus;
  activeSessions: KaderDashboardSession[];
  waitingSessions: KaderDashboardWaitingSession[];
};

export type SessionStatus = "waiting" | "active" | "escalated" | "ended";

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

export type SessionStudentInfo = {
  displayName: string;
  topics: Topic[];
  status: SessionStatus;
};

export const MAX_BIO_LENGTH = 150;
