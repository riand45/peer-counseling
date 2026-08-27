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
