"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function login(formData: FormData) {
  const supabase = await createClient();

  const credentials = {
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  };

  const { error } = await supabase.auth.signInWithPassword(credentials);

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signup(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = (formData.get("full_name") as string) ?? "";
  // Role dibatasi ke nilai valid; default 'kader'.
  const rawRole = formData.get("role") as string;
  const role = rawRole === "guru" ? "guru" : "kader";

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Dibaca oleh trigger handle_new_user() untuk mengisi public.profiles.
      data: { full_name: fullName, role },
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * Verifikasi seorang kader. Hanya efektif bila pemanggil adalah guru
 * (ditegakkan oleh RLS "profiles: guru update semua").
 */
export async function verifyKader(formData: FormData) {
  const supabase = await createClient();
  const kaderId = formData.get("kader_id") as string;

  await supabase
    .from("profiles")
    .update({ is_verified: true })
    .eq("id", kaderId);

  revalidatePath("/", "layout");
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
