import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusToggle } from "@/components/kader/StatusToggle";
import type { KaderStatus } from "@/lib/student/types";

export default async function KaderProfilPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/kader/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, status")
    .eq("id", user.id)
    .single();

  const fullName = (profile?.full_name as string | null) ?? "Kader";
  const status = (profile?.status as KaderStatus | null) ?? "offline";
  const initial = fullName.trim().charAt(0).toUpperCase() || "K";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-lowest p-md text-center">
        <div
          aria-hidden="true"
          className="flex h-20 w-20 items-center justify-center rounded-full bg-primary-fixed text-headline-lg text-on-primary-fixed"
        >
          {initial}
        </div>
        <h1 className="text-headline-md font-bold text-on-surface">Kak {fullName}</h1>
        <p className="rounded-full bg-primary-fixed-dim px-3 py-1 text-label-md text-primary">Kader Aktif</p>
      </div>

      <div className="rounded-lg border border-outline-variant bg-surface-container-lowest p-md">
        <h2 className="mb-4 text-headline-md text-on-surface">Status Kehadiran</h2>
        <StatusToggle status={status} />
      </div>

      <p className="text-body-md text-on-surface-variant">
        Pengaturan bio dan topik konsultasi akan tersedia pada pembaruan berikutnya.
      </p>
    </div>
  );
}
