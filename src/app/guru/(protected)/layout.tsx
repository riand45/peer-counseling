import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signout } from "@/lib/auth/actions";
import { GuruShell } from "@/components/shells/GuruShell";
import { Button } from "@/components/ui/Button";

const navItems = [
  { href: "/guru", label: "Beranda", icon: "🏠" },
  { href: "/guru/konsultasi", label: "Daftar Konsultasi", icon: "📋" },
  { href: "/guru/statistik", label: "Statistik", icon: "📊" },
  { href: "/guru/profil", label: "Profil", icon: "🙂" },
];

function ClockIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

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
    .select("role, is_verified")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/guru/login");
  }

  if (profile.role !== "guru") {
    redirect("/kader");
  }

  if (!profile.is_verified) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-surface p-sm">
        <div className="w-full max-w-[28rem] rounded-lg border border-outline-variant bg-surface-container-lowest p-md text-center">
          <h1 className="text-headline-md font-bold text-on-surface">Menunggu verifikasi</h1>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Akun Guru BK Anda belum diverifikasi. Hubungi admin sekolah atau
            pengelola aplikasi untuk verifikasi.
          </p>
          <form action={signout} className="mt-6">
            <Button type="submit" variant="ghost" className="w-full">
              Keluar
            </Button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <GuruShell
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
    </GuruShell>
  );
}
