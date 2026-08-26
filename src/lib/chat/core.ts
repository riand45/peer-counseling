import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatActor, ChatMessage } from "./types";

export function sessionChannelName(sessionId: string): string {
  return `session:${sessionId}`;
}

async function assertActorCanAccessSession(
  supabase: SupabaseClient,
  sessionId: string,
  actor: ChatActor,
) {
  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, student_local_id, assigned_to")
    .eq("id", sessionId)
    .single();

  if (error || !session) {
    throw new Error("Sesi tidak ditemukan");
  }

  if (actor.kind === "student" && session.student_local_id !== actor.studentLocalId) {
    throw new Error("Tidak diizinkan mengakses sesi ini");
  }

  if (actor.kind === "kader" && session.assigned_to !== actor.userId) {
    throw new Error("Tidak diizinkan mengakses sesi ini");
  }

  return session;
}

export async function sendMessageCore(
  supabase: SupabaseClient,
  input: { sessionId: string; body: string; actor: ChatActor },
): Promise<ChatMessage> {
  await assertActorCanAccessSession(supabase, input.sessionId, input.actor);

  const { data, error } = await supabase
    .from("messages")
    .insert({
      session_id: input.sessionId,
      sender_role: input.actor.kind,
      body: input.body,
    })
    .select("id, session_id, sender_role, body, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Gagal mengirim pesan");
  }

  const message: ChatMessage = {
    id: data.id,
    sessionId: data.session_id,
    senderRole: data.sender_role,
    body: data.body,
    createdAt: data.created_at,
  };

  await supabase.channel(sessionChannelName(input.sessionId)).send({
    type: "broadcast",
    event: "new_message",
    payload: message,
  });

  return message;
}

export async function getSessionMessagesCore(
  supabase: SupabaseClient,
  input: { sessionId: string; actor: ChatActor },
): Promise<ChatMessage[]> {
  await assertActorCanAccessSession(supabase, input.sessionId, input.actor);

  const { data, error } = await supabase
    .from("messages")
    .select("id, session_id, sender_role, body, created_at")
    .eq("session_id", input.sessionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    senderRole: row.sender_role,
    body: row.body,
    createdAt: row.created_at,
  }));
}
