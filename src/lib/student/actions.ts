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

export async function startSession(input: {
  studentLocalId: string;
  topics: Topic[];
  kaderId: string;
}): Promise<{ sessionId: string }> {
  const service = createServiceClient();

  const { data: kader, error: kaderError } = await service
    .from("profiles")
    .select("status")
    .eq("id", input.kaderId)
    .single();

  if (kaderError || !kader) {
    throw new Error("Kader tidak ditemukan");
  }
  if (kader.status !== "available") {
    throw new Error("Kader ini sudah tidak tersedia, silakan pilih kader lain");
  }

  const { data, error } = await service
    .from("sessions")
    .insert({
      student_local_id: input.studentLocalId,
      assigned_to: input.kaderId,
      topics: input.topics,
      status: "active",
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Gagal memulai sesi");
  }

  return { sessionId: data.id as string };
}

export async function endSession(input: {
  sessionId: string;
  studentLocalId: string;
}): Promise<void> {
  const service = createServiceClient();

  const { data: session, error: findError } = await service
    .from("sessions")
    .select("student_local_id")
    .eq("id", input.sessionId)
    .single();

  if (findError || !session) {
    throw new Error("Sesi tidak ditemukan");
  }
  if (session.student_local_id !== input.studentLocalId) {
    throw new Error("Tidak diizinkan mengakhiri sesi ini");
  }

  const { error } = await service
    .from("sessions")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", input.sessionId);

  if (error) {
    throw new Error(error.message);
  }
}
