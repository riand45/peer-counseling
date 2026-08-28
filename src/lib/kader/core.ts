import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getStudentDisplayName } from "@/lib/student/types";
import type { KaderStatus, Topic } from "@/lib/student/types";
import type { KaderDashboard, KaderDashboardSession, SessionStatus, SessionStudentInfo } from "./types";
import { MAX_BIO_LENGTH } from "./types";

export async function getKaderDashboardCore(supabase: SupabaseClient): Promise<KaderDashboard> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    throw new Error("Gagal memuat profil");
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("sessions")
    .select("id, topics, student_local_id, last_message_at")
    .eq("assigned_to", user.id)
    .eq("status", "active")
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (sessionsError) {
    throw new Error("Gagal memuat daftar konsultasi");
  }

  const sessionRows = sessions ?? [];
  const studentLocalIds = sessionRows.map((row) => row.student_local_id as string);

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

  const latestMessageBySession = new Map<string, { body: string; created_at: string }>();
  const sessionIds = sessionRows.map((row) => row.id as string);
  if (sessionIds.length > 0) {
    const { data: messages } = await supabase
      .from("messages")
      .select("session_id, body, created_at")
      .in("session_id", sessionIds)
      .order("created_at", { ascending: false });
    for (const message of messages ?? []) {
      const sessionId = message.session_id as string;
      if (!latestMessageBySession.has(sessionId)) {
        latestMessageBySession.set(sessionId, {
          body: message.body as string,
          created_at: message.created_at as string,
        });
      }
    }
  }

  const activeSessions: KaderDashboardSession[] = sessionRows.map((row) => {
    const identity = identityById.get(row.student_local_id as string);
    const latest = latestMessageBySession.get(row.id as string);
    return {
      id: row.id as string,
      topics: (row.topics as Topic[]) ?? [],
      studentDisplayName: getStudentDisplayName(identity?.nickname, identity?.avatar_seed),
      lastMessagePreview: latest?.body ?? null,
      lastMessageAt: (row.last_message_at as string | null) ?? latest?.created_at ?? null,
    };
  });

  return {
    fullName: (profile.full_name as string | null) ?? "Kader",
    status: profile.status as KaderDashboard["status"],
    activeSessions,
  };
}

export async function updateKaderStatusCore(
  supabase: SupabaseClient,
  status: KaderStatus,
): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { error } = await supabase.from("profiles").update({ status }).eq("id", user.id);

  if (error) {
    throw new Error("Gagal memperbarui status");
  }
}

export async function endKaderSessionCore(supabase: SupabaseClient, sessionId: string): Promise<void> {
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

export async function getSessionStudentInfoCore(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<SessionStudentInfo> {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("topics, status, student_local_id")
    .eq("id", sessionId)
    .single();

  if (sessionError || !session) {
    throw new Error("Sesi tidak ditemukan");
  }

  const service = createServiceClient();
  const { data: identity } = await service
    .from("student_identities")
    .select("nickname, avatar_seed")
    .eq("id", session.student_local_id as string)
    .single();

  return {
    displayName: getStudentDisplayName(
      identity?.nickname as string | null | undefined,
      identity?.avatar_seed as string | null | undefined,
    ),
    topics: (session.topics as Topic[]) ?? [],
    status: session.status as SessionStatus,
  };
}

export async function updateKaderBioCore(supabase: SupabaseClient, bio: string): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const trimmed = bio.trim();
  if (trimmed.length > MAX_BIO_LENGTH) {
    throw new Error(`Bio maksimal ${MAX_BIO_LENGTH} karakter`);
  }

  const { error } = await supabase
    .from("profiles")
    .update({ bio: trimmed.length > 0 ? trimmed : null })
    .eq("id", user.id);

  if (error) {
    throw new Error("Gagal menyimpan bio");
  }
}

export async function updateKaderTopicsCore(supabase: SupabaseClient, topics: Topic[]): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("Anda harus login");
  }

  const { error } = await supabase.from("profiles").update({ topics }).eq("id", user.id);

  if (error) {
    throw new Error("Gagal memperbarui topik");
  }
}
