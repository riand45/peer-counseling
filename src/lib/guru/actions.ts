"use server";

import { createClient } from "@/lib/supabase/server";
import { getConsultationDetailCore, getGuruDashboardCore, listConsultationsCore } from "./core";
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
