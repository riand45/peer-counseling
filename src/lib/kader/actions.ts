"use server";

import { createClient } from "@/lib/supabase/server";
import { getKaderDashboardCore } from "./core";
import type { KaderDashboard } from "./types";

export async function getKaderDashboard(): Promise<KaderDashboard> {
  const supabase = await createClient();
  return getKaderDashboardCore(supabase);
}
