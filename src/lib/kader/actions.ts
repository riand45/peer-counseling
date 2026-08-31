"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getKaderDashboardCore,
  updateKaderStatusCore,
  endKaderSessionCore,
  acceptKaderSessionCore,
  getSessionStudentInfoCore,
  updateKaderBioCore,
  updateKaderAvatarCore,
  updateKaderTopicsCore,
  getAvailableKaderForTransferCore,
  transferSessionCore,
  escalateSessionCore,
} from "./core";
import type { KaderStatus, KaderSummary, Topic } from "@/lib/student/types";
import type { KaderDashboard, SessionStudentInfo } from "./types";

export async function getKaderDashboard(): Promise<KaderDashboard> {
  const supabase = await createClient();
  return getKaderDashboardCore(supabase);
}

export async function updateKaderStatus(status: KaderStatus): Promise<void> {
  const supabase = await createClient();
  await updateKaderStatusCore(supabase, status);
  revalidatePath("/kader");
  revalidatePath("/kader/profil");
}

export async function endKaderSession(input: { sessionId: string }): Promise<void> {
  const supabase = await createClient();
  await endKaderSessionCore(supabase, input.sessionId);
  revalidatePath("/kader");
}

export async function acceptKaderSession(input: { sessionId: string }): Promise<void> {
  const supabase = await createClient();
  await acceptKaderSessionCore(supabase, input.sessionId);
  revalidatePath("/kader");
}

export async function getSessionStudentInfo(input: { sessionId: string }): Promise<SessionStudentInfo> {
  const supabase = await createClient();
  return getSessionStudentInfoCore(supabase, input.sessionId);
}

export async function updateKaderBio(bio: string): Promise<void> {
  const supabase = await createClient();
  await updateKaderBioCore(supabase, bio);
  revalidatePath("/kader/profil");
}

export async function updateKaderAvatar(avatarSeed: string): Promise<void> {
  const supabase = await createClient();
  await updateKaderAvatarCore(supabase, avatarSeed);
  revalidatePath("/kader/profil");
}

export async function updateKaderTopics(topics: Topic[]): Promise<void> {
  const supabase = await createClient();
  await updateKaderTopicsCore(supabase, topics);
  revalidatePath("/kader/profil");
}

export async function getAvailableKaderForTransfer(input: { sessionId: string }): Promise<KaderSummary[]> {
  const supabase = await createClient();
  return getAvailableKaderForTransferCore(supabase, input.sessionId);
}

export async function transferSession(input: { sessionId: string; toKaderId: string }): Promise<void> {
  const supabase = await createClient();
  await transferSessionCore(supabase, input);
  revalidatePath("/kader");
}

export async function escalateSession(input: { sessionId: string; reason: string | null }): Promise<void> {
  const supabase = await createClient();
  await escalateSessionCore(supabase, input);
}
