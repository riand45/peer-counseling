"use server";

import { createServiceClient } from "@/lib/supabase/service";
import type {
  Topic,
  KaderSummary,
  KaderStatus,
  StudentSessionSummary,
  StudentProfile,
  ReportReason,
} from "./types";
import { AVATAR_SEED_LABELS } from "./types";

function randomAvatarSeed(): string {
  const seeds = Object.keys(AVATAR_SEED_LABELS);
  return seeds[Math.floor(Math.random() * seeds.length)];
}

export async function createStudentIdentity(input: {
  localId: string;
  nickname?: string;
}): Promise<{ id: string }> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("student_identities")
    .insert({
      id: input.localId,
      nickname: input.nickname || null,
      avatar_seed: randomAvatarSeed(),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createStudentIdentity failed:", error);
    throw new Error("Gagal membuat identitas");
  }

  return { id: data.id as string };
}

export async function listAvailableKader(): Promise<KaderSummary[]> {
  const service = createServiceClient();

  const { data: usersData } = await service.auth.admin.listUsers();
  const avatarByUserId = new Map<string, string>();
  for (const u of usersData?.users ?? []) {
    if (u.user_metadata?.avatar_seed) {
      avatarByUserId.set(u.id, u.user_metadata.avatar_seed as string);
    }
  }

  const { data, error } = await service
    .from("profiles")
    .select("id, full_name, bio, topics, status")
    .eq("role", "kader")
    .eq("is_verified", true);

  if (error) {
    console.error("listAvailableKader failed:", error);
    throw new Error("Gagal memuat daftar kader");
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    fullName: (row.full_name as string | null) ?? "Kader",
    bio: row.bio as string | null,
    topics: (row.topics as Topic[] | null) ?? [],
    status: row.status as KaderSummary["status"],
    avatarSeed: avatarByUserId.get(row.id as string) ?? (row as unknown as { avatar_seed?: string }).avatar_seed ?? "kucing",
  }));
}

export async function startSession(input: {
  studentLocalId: string;
  topics: Topic[];
  kaderId: string;
}): Promise<{ sessionId: string }> {
  const service = createServiceClient();

  const { data: kader, error: kaderError } = await service
    .from("profiles")
    .select("status, role, is_verified")
    .eq("id", input.kaderId)
    .single();

  if (kaderError || !kader) {
    throw new Error("Kader tidak ditemukan");
  }
  if (kader.role !== "kader" || !kader.is_verified) {
    throw new Error("Kader tidak ditemukan");
  }
  if (kader.status !== "available") {
    throw new Error("Kader ini sudah tidak tersedia, silakan pilih kader lain");
  }

  const { data, error } = await service
    .from("sessions")
    .insert({
      student_local_id: input.studentLocalId,
      assigned_to: input.kaderId,
      topics: input.topics,
      status: "waiting",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("startSession failed:", error);
    throw new Error("Gagal memulai sesi");
  }

  return { sessionId: data.id as string };
}

export async function endSession(input: {
  sessionId: string;
  studentLocalId: string;
}): Promise<void> {
  const service = createServiceClient();

  const { data: session, error: findError } = await service
    .from("sessions")
    .select("student_local_id")
    .eq("id", input.sessionId)
    .single();

  if (findError || !session) {
    throw new Error("Sesi tidak ditemukan");
  }
  if (session.student_local_id !== input.studentLocalId) {
    throw new Error("Tidak diizinkan mengakhiri sesi ini");
  }

  const { error } = await service
    .from("sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", input.sessionId);

  if (error) {
    console.error("endSession failed:", error);
    throw new Error("Gagal mengakhiri sesi, coba lagi");
  }
}

export async function getSessionKader(input: {
  sessionId: string;
  studentLocalId: string;
}): Promise<{ fullName: string; status: KaderStatus; avatarSeed?: string } | null> {
  const service = createServiceClient();

  const { data: session, error: sessionError } = await service
    .from("sessions")
    .select("student_local_id, assigned_to")
    .eq("id", input.sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error("Sesi tidak ditemukan");
  }
  if (session.student_local_id !== input.studentLocalId) {
    throw new Error("Tidak diizinkan mengakses sesi ini");
  }
  if (!session.assigned_to) {
    return null;
  }

  const { data: kader, error: kaderError } = await service
    .from("profiles")
    .select("full_name, status")
    .eq("id", session.assigned_to)
    .single();

  if (kaderError || !kader) {
    return null;
  }

  let avatarSeed = (kader as unknown as { avatar_seed?: string }).avatar_seed;
  if (!avatarSeed && session.assigned_to) {
    try {
      const { data: userData } = await service.auth.admin.getUserById(session.assigned_to as string);
      avatarSeed = userData?.user?.user_metadata?.avatar_seed as string | undefined;
    } catch {
      // Non-fatal fallback
    }
  }

  return {
    fullName: kader.full_name ?? "Kader",
    status: kader.status as KaderStatus,
    avatarSeed: avatarSeed ?? "kucing",
  };
}

export async function getStudentSessions(input: {
  studentLocalId: string;
}): Promise<StudentSessionSummary[]> {
  const service = createServiceClient();

  const { data: sessions, error } = await service
    .from("sessions")
    .select("id, topics, status, assigned_to, last_message_at")
    .eq("student_local_id", input.studentLocalId)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("getStudentSessions failed:", error);
    throw new Error("Gagal memuat riwayat cerita");
  }

  const sessionRows = sessions ?? [];

  const kaderIds = [
    ...new Set(
      sessionRows
        .map((row) => row.assigned_to as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const kaderInfoById = new Map<string, { name: string; avatarSeed: string }>();
  if (kaderIds.length > 0) {
    const { data: usersData } = await service.auth.admin.listUsers();
    const avatarByUserId = new Map<string, string>();
    for (const u of usersData?.users ?? []) {
      if (u.user_metadata?.avatar_seed) {
        avatarByUserId.set(u.id, u.user_metadata.avatar_seed as string);
      }
    }

    const { data: kaderProfiles } = await service
      .from("profiles")
      .select("id, full_name")
      .in("id", kaderIds);
    for (const row of kaderProfiles ?? []) {
      kaderInfoById.set(row.id as string, {
        name: (row.full_name as string | null) ?? "Kader",
        avatarSeed: avatarByUserId.get(row.id as string) ?? (row as unknown as { avatar_seed?: string }).avatar_seed ?? "kucing",
      });
    }
  }

  const sessionIds = sessionRows.map((row) => row.id as string);
  const latestMessageBySession = new Map<string, { body: string; created_at: string }>();
  if (sessionIds.length > 0) {
    const { data: messages } = await service
      .from("messages")
      .select("session_id, body, created_at")
      .in("session_id", sessionIds)
      .order("created_at", { ascending: false });
    for (const message of messages ?? []) {
      const sid = message.session_id as string;
      if (!latestMessageBySession.has(sid)) {
        latestMessageBySession.set(sid, {
          body: message.body as string,
          created_at: message.created_at as string,
        });
      }
    }
  }

  return sessionRows.map((row) => {
    const assignedTo = row.assigned_to as string | null;
    const kaderInfo = assignedTo ? kaderInfoById.get(assignedTo) : null;
    const latest = latestMessageBySession.get(row.id as string);
    return {
      id: row.id as string,
      topics: (row.topics as Topic[]) ?? [],
      kaderName: kaderInfo?.name ?? null,
      kaderAvatarSeed: kaderInfo?.avatarSeed ?? null,
      lastMessagePreview: latest?.body ?? null,
      lastMessageAt: (row.last_message_at as string | null) ?? latest?.created_at ?? null,
      status: row.status as StudentSessionSummary["status"],
    };
  });
}

export async function getStudentProfile(input: {
  studentLocalId: string;
}): Promise<StudentProfile> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("student_identities")
    .select("nickname, avatar_seed")
    .eq("id", input.studentLocalId)
    .single();

  if (error || !data) {
    throw new Error("Identitas tidak ditemukan");
  }

  return {
    nickname: data.nickname as string | null,
    avatarSeed: (data.avatar_seed as string | null) ?? "kucing",
  };
}

export async function updateStudentProfile(input: {
  studentLocalId: string;
  nickname?: string;
  avatarSeed?: string;
}): Promise<void> {
  if (input.avatarSeed !== undefined && !Object.hasOwn(AVATAR_SEED_LABELS, input.avatarSeed)) {
    throw new Error("Avatar tidak dikenal");
  }

  if (input.nickname === undefined && input.avatarSeed === undefined) {
    return;
  }

  const update: Record<string, unknown> = {};
  if (input.nickname !== undefined) {
    update.nickname = input.nickname.trim() || null;
  }
  if (input.avatarSeed !== undefined) {
    update.avatar_seed = input.avatarSeed;
  }

  const service = createServiceClient();
  const { error } = await service
    .from("student_identities")
    .update(update)
    .eq("id", input.studentLocalId);

  if (error) {
    console.error("updateStudentProfile failed:", error);
    throw new Error("Gagal memperbarui profil");
  }
}

export async function submitSessionReport(input: {
  sessionId: string;
  studentLocalId: string;
  reason: ReportReason;
  details?: string;
}): Promise<void> {
  const service = createServiceClient();

  const { data: session, error: sessionError } = await service
    .from("sessions")
    .select("student_local_id")
    .eq("id", input.sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error("Sesi tidak ditemukan");
  }
  if (session.student_local_id !== input.studentLocalId) {
    throw new Error("Tidak diizinkan melaporkan sesi ini");
  }

  const { error } = await service.from("session_reports").insert({
    session_id: input.sessionId,
    reason: input.reason,
    details: input.details?.trim() || null,
  });

  if (error) {
    console.error("submitSessionReport failed:", error);
    throw new Error("Gagal mengirim laporan");
  }
}

export async function deleteStudentIdentity(input: { studentLocalId: string }): Promise<void> {
  const service = createServiceClient();
  const { error } = await service
    .from("student_identities")
    .delete()
    .eq("id", input.studentLocalId);

  if (error) {
    console.error("deleteStudentIdentity failed:", error);
    throw new Error("Gagal menghapus akun");
  }
}
