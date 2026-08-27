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

export async function listAvailableKader(): Promise<KaderSummary[]> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("profiles")
    .select("id, full_name, bio, topics, status")
    .eq("role", "kader")
    .eq("is_verified", true);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    fullName: (row.full_name as string | null) ?? "Kader",
    bio: row.bio as string | null,
    topics: (row.topics as Topic[] | null) ?? [],
    status: row.status as KaderSummary["status"],
  }));
}
