"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendMessageCore, getSessionMessagesCore } from "./core";
import type { ChatActor, ChatMessage } from "./types";

async function resolveStaffActor(): Promise<ChatActor> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Anda harus login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "guru") {
    return { kind: "guru", userId: user.id };
  }
  return { kind: "kader", userId: user.id };
}

export async function sendMessage(input: {
  sessionId: string;
  body: string;
  studentLocalId?: string;
}): Promise<ChatMessage> {
  if (input.studentLocalId) {
    const service = createServiceClient();
    return sendMessageCore(service, {
      sessionId: input.sessionId,
      body: input.body,
      actor: { kind: "student", studentLocalId: input.studentLocalId },
    });
  }

  const actor = await resolveStaffActor();
  const supabase = await createClient();
  return sendMessageCore(supabase, {
    sessionId: input.sessionId,
    body: input.body,
    actor,
  });
}

export async function getSessionMessages(input: {
  sessionId: string;
  studentLocalId?: string;
}): Promise<ChatMessage[]> {
  if (input.studentLocalId) {
    const service = createServiceClient();
    return getSessionMessagesCore(service, {
      sessionId: input.sessionId,
      actor: { kind: "student", studentLocalId: input.studentLocalId },
    });
  }

  const actor = await resolveStaffActor();
  const supabase = await createClient();
  return getSessionMessagesCore(supabase, {
    sessionId: input.sessionId,
    actor,
  });
}
