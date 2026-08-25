import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KaderShell } from "@/components/shells/KaderShell";

const navItems = [
  { href: "/kader", label: "Beranda", icon: "🏠" },
  { href: "/kader/profil", label: "Profil", icon: "🙂" },
];

export default async function KaderLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/kader/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_verified")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "kader") {
    redirect("/guru");
  }

  if (!profile.is_verified) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface p-sm">
        <div className="max-w-sm rounded-lg border border-outline-variant bg-surface-container-lowest p-md text-center">
          <h1 className="text-headline-md font-bold text-on-surface">Menunggu verifikasi</h1>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Akun kader Anda belum diverifikasi oleh Guru BK. Silakan tunggu
            atau hubungi Guru BK di sekolah Anda.
          </p>
        </div>
      </main>
    );
  }

  return <KaderShell navItems={navItems}>{children}</KaderShell>;
}
