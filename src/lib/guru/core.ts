import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getStudentDisplayName, TOPICS } from "@/lib/student/types";
import type { Topic } from "@/lib/student/types";
import type { SessionStatus } from "@/lib/kader/types";
import type {
  ActivityItem,
  AttentionItem,
  ConsultationCounts,
  ConsultationDetail,
  ConsultationListItem,
  ConsultationListResult,
  GuruDashboard,
  GuruStatistics,
  StatisticsRangeDays,
  StatisticsTrendPoint,
  StatusDistributionEntry,
  TopicDistributionEntry,
} from "./types";

const ACTIVITY_LIMIT = 10;
const ATTENTION_LIMIT = 20;
const SESSION_STATUS_ORDER: SessionStatus[] = ["waiting", "active", "escalated", "ended"];

async function resolveStudentDisplayNames(
  supabase: SupabaseClient,
  studentLocalIds: string[],
): Promise<Map<string, { nickname: string | null; avatar_seed: string | null }>> {
  const identityById = new Map<string, { nickname: string | null; avatar_seed: string | null }>();
  if (studentLocalIds.length === 0) {
    return identityById;
  }
  const service = createServiceClient();
  const { data: identities } = await service
    .from("student_identities")
    .select("id, nickname, avatar_seed")
    .in("id", studentLocalIds);
  for (const identity of identities ?? []) {
    identityById.set(identity.id as string, {
      nickname: identity.nickname as string | null,
      avatar_seed: identity.avatar_seed as string | null,
    });
  }
  return identityById;
}

async function resolveKaderNames(
  supabase: SupabaseClient,
  kaderIds: string[],
): Promise<Map<string, string>> {
  const kaderNameById = new Map<string, string>();
  if (kaderIds.length === 0) {
    return kaderNameById;
  }
  const { data: kaderProfiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", kaderIds);
  for (const row of kaderProfiles ?? []) {
    kaderNameById.set(row.id as string, (row.full_name as string | null) ?? "Kader");
  }
  return kaderNameById;
}

export async function getGuruDashboardCore(supabase: SupabaseClient): Promise<GuruDashboard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("Gagal memuat profil");
  }

  const { data: statusRows, error: statusError } = await supabase
    .from("sessions")
    .select("status")
    .is("archived_at", null);

  if (statusError) {
    throw new Error("Gagal memuat ringkasan konsultasi");
  }

  const counts: ConsultationCounts = { total: 0, active: 0, waiting: 0, ended: 0 };
  for (const row of statusRows ?? []) {
    counts.total += 1;
    const status = row.status as SessionStatus;
    if (status === "active") counts.active += 1;
    else if (status === "waiting") counts.waiting += 1;
    else if (status === "ended") counts.ended += 1;
  }

  const [{ data: escalations, error: escalationsError }, { data: reports, error: reportsError }] =
    await Promise.all([
      supabase
        .from("escalations")
        .select("session_id, reason, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(ATTENTION_LIMIT),
      supabase
        .from("session_reports")
        .select("session_id, details, created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(ATTENTION_LIMIT),
    ]);

  if (escalationsError || reportsError) {
    throw new Error("Gagal memuat daftar butuh perhatian");
  }

  const attentionSource = [
    ...(escalations ?? []).map((row) => ({
      sessionId: row.session_id as string,
      kind: "escalation" as const,
      detail: (row.reason as string | null) ?? "Eskalasi tanpa keterangan",
      createdAt: row.created_at as string,
    })),
    ...(reports ?? []).map((row) => ({
      sessionId: row.session_id as string,
      kind: "report" as const,
      detail: (row.details as string | null) ?? "Tidak ada detail tambahan",
      createdAt: row.created_at as string,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const { data: activityRows, error: activityError } = await supabase
    .from("sessions")
    .select("id, topics, status, student_local_id, assigned_to, last_message_at, created_at")
    .is("archived_at", null);

  if (activityError) {
    throw new Error("Gagal memuat aktivitas terbaru");
  }

  // last_message_at has no default and stays null until a session's first
  // message — a DB-side .limit() on that column alone would silently drop
  // brand-new, not-yet-messaged sessions once ≥ACTIVITY_LIMIT other sessions
  // have a non-null last_message_at. Coalesce to created_at and sort/limit
  // in JS instead, so a newly created session always sorts by its own recency.
  const activityRowList = (activityRows ?? [])
    .slice()
    .sort((a, b) => {
      const aKey = (a.last_message_at as string | null) ?? (a.created_at as string);
      const bKey = (b.last_message_at as string | null) ?? (b.created_at as string);
      return bKey.localeCompare(aKey);
    })
    .slice(0, ACTIVITY_LIMIT);

  const sessionInfoById = new Map<string, { student_local_id: string; assigned_to: string | null }>();
  for (const row of activityRowList) {
    sessionInfoById.set(row.id as string, {
      student_local_id: row.student_local_id as string,
      assigned_to: row.assigned_to as string | null,
    });
  }

  // Attention items only carry session_id — resolve student_local_id for any
  // attention session the activity query above didn't already cover.
  const missingSessionIds = [...new Set(attentionSource.map((item) => item.sessionId))].filter(
    (sessionId) => !sessionInfoById.has(sessionId),
  );
  if (missingSessionIds.length > 0) {
    const { data: attentionSessions } = await supabase
      .from("sessions")
      .select("id, student_local_id, assigned_to")
      .in("id", missingSessionIds);
    for (const row of attentionSessions ?? []) {
      sessionInfoById.set(row.id as string, {
        student_local_id: row.student_local_id as string,
        assigned_to: row.assigned_to as string | null,
      });
    }
  }

  const studentLocalIds = [...new Set([...sessionInfoById.values()].map((info) => info.student_local_id))];
  const identityById = await resolveStudentDisplayNames(supabase, studentLocalIds);

  const kaderIds = [
    ...new Set(
      [...sessionInfoById.values()]
        .map((info) => info.assigned_to)
        .filter((kaderId): kaderId is string => Boolean(kaderId)),
    ),
  ];
  const kaderNameById = await resolveKaderNames(supabase, kaderIds);

  function displayNameForSession(sessionId: string): string {
    const info = sessionInfoById.get(sessionId);
    const identity = info ? identityById.get(info.student_local_id) : undefined;
    return getStudentDisplayName(identity?.nickname, identity?.avatar_seed);
  }

  const attention: AttentionItem[] = attentionSource.map((item) => ({
    sessionId: item.sessionId,
    kind: item.kind,
    studentDisplayName: displayNameForSession(item.sessionId),
    detail: item.detail,
    createdAt: item.createdAt,
  }));

  const activity: ActivityItem[] = activityRowList.map((row) => {
    const info = sessionInfoById.get(row.id as string);
    return {
      sessionId: row.id as string,
      studentDisplayName: displayNameForSession(row.id as string),
      topics: (row.topics as Topic[]) ?? [],
      assignedKaderName: info?.assigned_to ? kaderNameById.get(info.assigned_to) ?? null : null,
      status: row.status as SessionStatus,
      lastMessageAt: (row.last_message_at as string | null) ?? null,
    };
  });

  return {
    fullName: (profile.full_name as string | null) ?? "Guru BK",
    counts,
    attention,
    activity,
  };
}

const DEFAULT_PAGE_SIZE = 10;

export async function listConsultationsCore(
  supabase: SupabaseClient,
  input: {
    status?: SessionStatus;
    search?: string;
    page: number;
    pageSize?: number;
    includeArchived?: boolean;
  },
): Promise<ConsultationListResult> {
  const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;

  let query = supabase
    .from("sessions")
    .select("id, topics, status, student_local_id, assigned_to, created_at, archived_at")
    .order("created_at", { ascending: false });

  if (input.status) {
    query = query.eq("status", input.status);
  }

  if (!input.includeArchived) {
    query = query.is("archived_at", null);
  }

  const { data: sessions, error } = await query;
  if (error) {
    throw new Error("Gagal memuat daftar konsultasi");
  }

  const sessionRows = sessions ?? [];

  const studentLocalIds = [...new Set(sessionRows.map((row) => row.student_local_id as string))];
  const identityById = await resolveStudentDisplayNames(supabase, studentLocalIds);

  const kaderIds = [
    ...new Set(
      sessionRows
        .map((row) => row.assigned_to as string | null)
        .filter((kaderId): kaderId is string => Boolean(kaderId)),
    ),
  ];
  const kaderNameById = await resolveKaderNames(supabase, kaderIds);

  const allItems: ConsultationListItem[] = sessionRows.map((row) => {
    const identity = identityById.get(row.student_local_id as string);
    const assignedTo = row.assigned_to as string | null;
    return {
      sessionId: row.id as string,
      studentDisplayName: getStudentDisplayName(identity?.nickname, identity?.avatar_seed),
      topics: (row.topics as Topic[]) ?? [],
      assignedKaderName: assignedTo ? kaderNameById.get(assignedTo) ?? null : null,
      status: row.status as SessionStatus,
      createdAt: row.created_at as string,
      archived: Boolean(row.archived_at),
    };
  });

  const search = input.search?.trim().toLowerCase();
  const filtered = search
    ? allItems.filter(
        (item) =>
          item.sessionId.toLowerCase().includes(search) ||
          item.studentDisplayName.toLowerCase().includes(search),
      )
    : allItems;

  const page = Math.max(1, input.page);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return { items, total: filtered.length, page, pageSize };
}

export async function getConsultationDetailCore(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<ConsultationDetail> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, topics, status, student_local_id, assigned_to, created_at, archived_at")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    throw new Error("Sesi tidak ditemukan");
  }

  const assignedTo = session.assigned_to as string | null;

  const identityById = await resolveStudentDisplayNames(supabase, [session.student_local_id as string]);
  const kaderNameById = await resolveKaderNames(supabase, assignedTo ? [assignedTo] : []);
  const identity = identityById.get(session.student_local_id as string);

  let assignedKaderAvatarSeed: string | null = null;
  if (assignedTo) {
    try {
      const { data: kaderData } = await supabase.auth.admin.getUserById(assignedTo);
      assignedKaderAvatarSeed = (kaderData?.user?.user_metadata?.avatar_seed as string | null) ?? "kucing";
    } catch {
      // Non-fatal
    }
  }

  const { data: referralRows } = await supabase
    .from("professional_referrals")
    .select("note, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1);

  const latestReferral = referralRows?.[0]
    ? { note: referralRows[0].note as string | null, createdAt: referralRows[0].created_at as string }
    : null;

  return {
    sessionId: session.id as string,
    studentDisplayName: getStudentDisplayName(identity?.nickname, identity?.avatar_seed),
    studentAvatarSeed: (identity?.avatar_seed as string | null) ?? null,
    assignedKaderName: assignedTo ? kaderNameById.get(assignedTo) ?? null : null,
    assignedKaderAvatarSeed,
    hasTakenOver: assignedTo === user.id,
    topics: (session.topics as Topic[]) ?? [],
    status: session.status as SessionStatus,
    createdAt: session.created_at as string,
    archivedAt: (session.archived_at as string | null) ?? null,
    latestReferral,
  };
}

export async function endConsultationAsGuruCore(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { data, error } = await supabase
    .from("sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Gagal mengakhiri sesi, coba lagi");
  }
}

export async function takeOverConsultationCore(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("assigned_to")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error("Sesi tidak ditemukan");
  }

  const { error: assignmentError } = await supabase.from("session_assignments").insert({
    session_id: sessionId,
    from_id: session.assigned_to,
    to_id: user.id,
    changed_by: user.id,
    reason: "takeover",
  });

  if (assignmentError) {
    throw new Error("Gagal mencatat pengambilalihan");
  }

  const { data: updated, error: updateError } = await supabase
    .from("sessions")
    .update({ assigned_to: user.id })
    .eq("id", sessionId)
    .select("id")
    .single();

  if (updateError || !updated) {
    throw new Error("Gagal mengambil alih percakapan");
  }
}

export async function archiveSessionCore(supabase: SupabaseClient, sessionId: string): Promise<void> {
  const { data, error } = await supabase
    .from("sessions")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", sessionId)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("Gagal mengarsipkan sesi, coba lagi");
  }
}

export async function referToProfessionalCore(
  supabase: SupabaseClient,
  input: { sessionId: string; note?: string },
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const note = input.note?.trim();
  const { error } = await supabase.from("professional_referrals").insert({
    session_id: input.sessionId,
    referred_by: user.id,
    note: note ? note : null,
  });

  if (error) {
    throw new Error("Gagal mencatat rujukan ke profesional");
  }
}

export async function getGuruStatisticsCore(
  supabase: SupabaseClient,
  rangeDays: StatisticsRangeDays,
): Promise<GuruStatistics> {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceUtc = todayUtc - (rangeDays - 1) * 24 * 60 * 60 * 1000;
  const since = new Date(sinceUtc).toISOString();

  const [{ data: sessionRows, error: sessionsError }, { data: escalationRows, error: escalationsError }] =
    await Promise.all([
      supabase
        .from("sessions")
        .select("id, topics, status, student_local_id, started_at, ended_at, created_at")
        .gte("created_at", since)
        .is("archived_at", null),
      supabase.from("escalations").select("id").eq("status", "pending").gte("created_at", since),
    ]);

  if (sessionsError || escalationsError) {
    throw new Error("Gagal memuat statistik konsultasi");
  }

  const sessions = sessionRows ?? [];
  const totalSessions = sessions.length;
  const activeStudents = new Set(sessions.map((row) => row.student_local_id as string)).size;

  const durations = sessions
    .map((row) => {
      const startedAt = row.started_at as string | null;
      const endedAt = row.ended_at as string | null;
      if (!startedAt || !endedAt) return null;
      return (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60000;
    })
    .filter((minutes): minutes is number => minutes !== null);
  const avgDurationMinutes =
    durations.length > 0 ? durations.reduce((sum, minutes) => sum + minutes, 0) / durations.length : null;

  const escalationCount = (escalationRows ?? []).length;

  const trendByDate = new Map<string, number>();
  for (let i = 0; i < rangeDays; i += 1) {
    const date = new Date(sinceUtc + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    trendByDate.set(date, 0);
  }
  for (const row of sessions) {
    const date = (row.created_at as string).slice(0, 10);
    trendByDate.set(date, (trendByDate.get(date) ?? 0) + 1);
  }
  const trend: StatisticsTrendPoint[] = [...trendByDate.entries()].map(([date, count]) => ({ date, count }));

  const statusCounts = new Map<SessionStatus, number>(SESSION_STATUS_ORDER.map((status) => [status, 0]));
  for (const row of sessions) {
    const status = row.status as SessionStatus;
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
  }
  const statusDistribution: StatusDistributionEntry[] = SESSION_STATUS_ORDER.map((status) => ({
    status,
    count: statusCounts.get(status) ?? 0,
  }));

  const topicCounts = new Map<Topic, number>(TOPICS.map((topic) => [topic, 0]));
  for (const row of sessions) {
    for (const topic of (row.topics as Topic[]) ?? []) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }
  const topicDistribution: TopicDistributionEntry[] = TOPICS.map((topic) => ({
    topic,
    count: topicCounts.get(topic) ?? 0,
  }));

  return {
    totalSessions,
    activeStudents,
    avgDurationMinutes,
    escalationCount,
    trend,
    statusDistribution,
    topicDistribution,
  };
}

const PROFILE_PAGE_SIZE = 20;

export async function listProfilesCore(
  supabase: SupabaseClient,
  input: {
    role?: "kader" | "guru";
    search?: string;
    page: number;
    pageSize?: number;
  },
): Promise<import("./types").ProfileListResult> {
  const pageSize = input.pageSize ?? PROFILE_PAGE_SIZE;

  let query = supabase
    .from("profiles")
    .select("id, full_name, role, is_verified, created_at")
    .order("created_at", { ascending: false });

  if (input.role) {
    query = query.eq("role", input.role);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error("Gagal memuat daftar profil");
  }

  const rows = data ?? [];
  const search = input.search?.trim().toLowerCase();
  const filtered = search
    ? rows.filter(
        (row) =>
          (row.full_name as string | null)?.toLowerCase().includes(search) ||
          (row.id as string).toLowerCase().includes(search),
      )
    : rows;

  const page = Math.max(1, input.page);
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map((row) => ({
    id: row.id as string,
    fullName: row.full_name as string | null,
    role: row.role as "kader" | "guru",
    isVerified: Boolean(row.is_verified),
    createdAt: row.created_at as string,
  }));

  return { items, total: filtered.length, page, pageSize };
}

export async function verifyProfileCore(
  supabase: SupabaseClient,
  profileId: string,
  isVerified: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ is_verified: isVerified })
    .eq("id", profileId);

  if (error) {
    throw new Error("Gagal memperbarui status verifikasi");
  }
}
