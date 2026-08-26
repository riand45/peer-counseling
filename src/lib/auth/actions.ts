"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "./types";

export async function login(formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const loginPath = (formData.get("redirect_to") as string) || "/kader/login";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`${loginPath}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");
  redirect(loginPath === "/guru/login" ? "/guru" : "/kader");
}

async function signupAs(role: AppRole, formData: FormData) {
  const supabase = await createClient();
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = (formData.get("full_name") as string) ?? "";
  const loginPath = role === "guru" ? "/guru/login" : "/kader/login";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role },
    },
  });

  if (error) {
    redirect(`${loginPath}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/", "layout");

  // Kalau konfirmasi email aktif di project ini, signUp() tidak
  // mengembalikan session (dan tidak menulis cookie) — mengarahkan ke
  // /kader atau /guru cuma akan langsung dibalikkan ke halaman login oleh
  // gate layout tanpa penjelasan apa pun. Jadi kembalikan ke login dengan
  // pesan "cek email dulu".
  if (!data.session) {
    redirect(`${loginPath}?message=confirm-email`);
  }

  redirect(role === "guru" ? "/guru" : "/kader");
}

export async function signupKader(formData: FormData) {
  return signupAs("kader", formData);
}

export async function signupGuru(formData: FormData) {
  return signupAs("guru", formData);
}

export async function verifyKader(formData: FormData) {
  const supabase = await createClient();
  const kaderId = formData.get("kader_id") as string;

  await supabase.from("profiles").update({ is_verified: true }).eq("id", kaderId);

  revalidatePath("/", "layout");
}

export async function signout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}
