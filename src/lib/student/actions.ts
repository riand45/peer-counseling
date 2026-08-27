"use server";

import { createServiceClient } from "@/lib/supabase/service";
import type { Topic, KaderSummary } from "./types";

const AVATAR_SEEDS = ["kucing", "kelinci", "rubah", "beruang", "burung", "rusa", "panda", "koala"];

function randomAvatarSeed(): string {
  return AVATAR_SEEDS[Math.floor(Math.random() * AVATAR_SEEDS.length)];
}

export async function createStudentIdentity(input: {
  localId: string;
  nickname?: string;
}): Promise<{ id: string }> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("student_identities")
    .insert({
      id: input.localId,
      nickname: input.nickname || null,
      avatar_seed: randomAvatarSeed(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Gagal membuat identitas");
  }

  return { id: data.id as string };
}
