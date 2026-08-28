"use server";

import { createClient } from "@/lib/supabase/server";
import { endConsultationAsGuruCore, getConsultationDetailCore, getGuruDashboardCore, listConsultationsCore, takeOverConsultationCore } from "./core";
import { revalidatePath } from "next/cache";
import type { SessionStatus } from "@/lib/kader/types";
import type { ConsultationDetail, ConsultationListResult, GuruDashboard } from "./types";

export async function getGuruDashboard(): Promise<GuruDashboard> {
  const supabase = await createClient();
  return getGuruDashboardCore(supabase);
}

export async function listConsultations(input: {
  status?: SessionStatus;
  search?: string;
  page: number;
}): Promise<ConsultationListResult> {
  const supabase = await createClient();
  return listConsultationsCore(supabase, input);
}

export async function getConsultationDetail(input: { sessionId: string }): Promise<ConsultationDetail> {
  const supabase = await createClient();
  return getConsultationDetailCore(supabase, input.sessionId);
}

export async function endConsultationAsGuru(input: { sessionId: string }): Promise<void> {
  const supabase = await createClient();
  await endConsultationAsGuruCore(supabase, input.sessionId);
  revalidatePath("/guru");
  revalidatePath("/guru/konsultasi");
  revalidatePath(`/guru/konsultasi/${input.sessionId}`);
}

export async function takeOverConsultation(input: { sessionId: string }): Promise<void> {
  const supabase = await createClient();
  await takeOverConsultationCore(supabase, input.sessionId);
  revalidatePath(`/guru/konsultasi/${input.sessionId}`);
}
