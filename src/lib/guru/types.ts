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

export { SESSION_STATUS_LABELS, SESSION_STATUS_TONES } from "@/lib/kader/types";

export type ConsultationListItem = {
  sessionId: string;
  studentDisplayName: string;
  topics: Topic[];
  assignedKaderName: string | null;
  status: SessionStatus;
  createdAt: string;
  archived: boolean;
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
  archivedAt: string | null;
  latestReferral: { note: string | null; createdAt: string } | null;
};

export type StatisticsRangeDays = 7 | 30 | 90;

export type StatisticsTrendPoint = { date: string; count: number };

export type StatusDistributionEntry = { status: SessionStatus; count: number };

export type TopicDistributionEntry = { topic: Topic; count: number };

export type GuruStatistics = {
  totalSessions: number;
  activeStudents: number;
  avgDurationMinutes: number | null;
  escalationCount: number;
  trend: StatisticsTrendPoint[];
  statusDistribution: StatusDistributionEntry[];
  topicDistribution: TopicDistributionEntry[];
};

export type ProfileRole = "kader" | "guru";

export type ProfileListItem = {
  id: string;
  fullName: string | null;
  role: ProfileRole;
  isVerified: boolean;
  createdAt: string;
};

export type ProfileListResult = {
  items: ProfileListItem[];
  total: number;
  page: number;
  pageSize: number;
};
