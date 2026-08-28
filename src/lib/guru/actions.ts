"use server";

import { createClient } from "@/lib/supabase/server";
import { getGuruDashboardCore } from "./core";
import type { GuruDashboard } from "./types";

export async function getGuruDashboard(): Promise<GuruDashboard> {
  const supabase = await createClient();
  return getGuruDashboardCore(supabase);
}
