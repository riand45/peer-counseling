import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signout } from "@/lib/auth/actions";
import { KaderShell } from "@/components/shells/KaderShell";
import { Button } from "@/components/ui/Button";

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

  if (!profile) {
    redirect("/kader/login");
  }

  if (profile.role !== "kader") {
    redirect("/guru");
  }

  if (!profile.is_verified) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface p-sm">
        <div className="w-full max-w-[28rem] rounded-lg border border-outline-variant bg-surface-container-lowest p-md text-center">
          <h1 className="text-headline-md font-bold text-on-surface">Menunggu verifikasi</h1>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Akun kader Anda belum diverifikasi oleh Guru BK. Silakan tunggu
            atau hubungi Guru BK di sekolah Anda.
          </p>
          <form action={signout} className="mt-4">
            <Button type="submit" variant="ghost" className="w-full">
              Keluar
            </Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <KaderShell
      navItems={navItems}
      primaryAction={
        <form action={signout}>
          <Button type="submit" variant="ghost" className="w-full">
            Keluar
          </Button>
        </form>
      }
    >
      {children}
    </KaderShell>
  );
}
