import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function GuruProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/guru/login");
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();

  const fullName = (profile?.full_name as string | null) ?? "Guru BK";
  const initial = fullName.trim().charAt(0).toUpperCase() || "G";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-md text-center">
        <div
          aria-hidden="true"
          className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-fixed text-headline-lg text-on-primary-fixed"
        >
          {initial}
        </div>
        <h1 className="text-headline-md font-bold text-on-surface">Pak/Bu {fullName}</h1>
        <p className="rounded-full bg-primary-fixed-dim px-3 py-1 text-label-md text-primary">Guru BK</p>
      </div>

      <p className="text-body-md text-on-surface-variant">
        Pengaturan profil tambahan akan tersedia pada pembaruan berikutnya.
      </p>
    </div>
  );
}
