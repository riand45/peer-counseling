import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getStudentDisplayName } from "@/lib/student/types";
import type { Topic } from "@/lib/student/types";
import type { SessionStatus } from "@/lib/kader/types";
import type { ActivityItem, AttentionItem, ConsultationCounts, GuruDashboard } from "./types";

const ACTIVITY_LIMIT = 10;
const ATTENTION_LIMIT = 20;

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

  const { data: statusRows, error: statusError } = await supabase.from("sessions").select("status");

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
    .select("id, topics, status, student_local_id, assigned_to, last_message_at, created_at");

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
  const identityById = new Map<string, { nickname: string | null; avatar_seed: string | null }>();
  if (studentLocalIds.length > 0) {
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
  }

  const kaderIds = [
    ...new Set(
      [...sessionInfoById.values()]
        .map((info) => info.assigned_to)
        .filter((kaderId): kaderId is string => Boolean(kaderId)),
    ),
  ];
  const kaderNameById = new Map<string, string>();
  if (kaderIds.length > 0) {
    const { data: kaderProfiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", kaderIds);
    for (const row of kaderProfiles ?? []) {
      kaderNameById.set(row.id as string, (row.full_name as string | null) ?? "Kader");
    }
  }

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
