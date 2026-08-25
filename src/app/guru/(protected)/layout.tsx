import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GuruShell } from "@/components/shells/GuruShell";

const navItems = [{ href: "/guru", label: "Beranda", icon: "🏠" }];

export default async function GuruLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/guru/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "guru") {
    redirect("/kader");
  }

  return <GuruShell navItems={navItems}>{children}</GuruShell>;
}
