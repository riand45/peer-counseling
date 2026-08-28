"use server";

import { createClient } from "@/lib/supabase/server";
import { getGuruDashboardCore, listConsultationsCore } from "./core";
import type { SessionStatus } from "@/lib/kader/types";
import type { ConsultationListResult, GuruDashboard } from "./types";

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
