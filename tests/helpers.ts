import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env var ${name} — needed for integration tests`);
  }
  return value;
}

export function getServiceClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    },
  );
}

export function getAnonClient(): SupabaseClient {
  return createClient(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    },
  );
}

export async function createTestStudentIdentity(): Promise<string> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("student_identities")
    .insert({ nickname: "Test Siswa" })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("insert failed");
  return data.id as string;
}

export async function deleteTestStudentIdentity(id: string): Promise<void> {
  const service = getServiceClient();
  await service.from("student_identities").delete().eq("id", id);
}

let testUserCounter = 0;

export async function createTestUser(
  role: "kader" | "guru",
  opts: { verified?: boolean } = {},
): Promise<{ id: string; email: string; password: string }> {
  const service = getServiceClient();
  testUserCounter += 1;
  const email = `test-${role}-${Date.now()}-${testUserCounter}@example.test`;
  const password = "Test1234!";
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Test ${role}`, role },
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  const userId = data.user.id;
  if (opts.verified) {
    await service.from("profiles").update({ is_verified: true }).eq("id", userId);
  }
  return { id: userId, email, password };
}

export async function deleteTestUser(id: string): Promise<void> {
  const service = getServiceClient();
  await service.auth.admin.deleteUser(id);
}

export async function signInTestUser(
  email: string,
  password: string,
): Promise<{ client: SupabaseClient; session: Session | null }> {
  const anon = getAnonClient();
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return { client: anon, session: data.session };
}

export async function createSignedInTestKader(
  opts: { verified?: boolean; status?: string } = {},
): Promise<{ id: string; client: SupabaseClient }> {
  const user = await createTestUser("kader", { verified: opts.verified ?? true });
  if (opts.status) {
    const service = getServiceClient();
    await service.from("profiles").update({ status: opts.status }).eq("id", user.id);
  }
  const { client } = await signInTestUser(user.email, user.password);
  return { id: user.id, client };
}

export async function createSignedInTestGuru(
  opts: { verified?: boolean } = {},
): Promise<{ id: string; client: SupabaseClient }> {
  const user = await createTestUser("guru", { verified: opts.verified ?? true });
  const { client } = await signInTestUser(user.email, user.password);
  return { id: user.id, client };
}

export async function createTestSession(input: {
  studentLocalId: string;
  assignedTo?: string;
  topics?: string[];
}): Promise<string> {
  const service = getServiceClient();
  const { data, error } = await service
    .from("sessions")
    .insert({
      student_local_id: input.studentLocalId,
      assigned_to: input.assignedTo ?? null,
      topics: input.topics ?? ["akademik"],
    })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("insert failed");
  return data.id as string;
}

export async function deleteTestSession(id: string): Promise<void> {
  const service = getServiceClient();
  await service.from("messages").delete().eq("session_id", id);
  await service.from("sessions").delete().eq("id", id);
}
