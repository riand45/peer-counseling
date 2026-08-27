import type { KaderStatus, Topic } from "@/lib/student/types";

export type KaderDashboardSession = {
  id: string;
  topics: Topic[];
  studentDisplayName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
};

export type KaderDashboard = {
  fullName: string;
  status: KaderStatus;
  activeSessions: KaderDashboardSession[];
};

export type SessionStatus = "waiting" | "active" | "escalated" | "ended";

export type SessionStudentInfo = {
  displayName: string;
  topics: Topic[];
  status: SessionStatus;
};
