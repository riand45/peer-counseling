"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {
  getKaderDashboardCore,
  updateKaderStatusCore,
  endKaderSessionCore,
  getSessionStudentInfoCore,
} from "./core";
import type { KaderStatus } from "@/lib/student/types";
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

export async function getSessionStudentInfo(input: { sessionId: string }): Promise<SessionStudentInfo> {
  const supabase = await createClient();
  return getSessionStudentInfoCore(supabase, input.sessionId);
}
