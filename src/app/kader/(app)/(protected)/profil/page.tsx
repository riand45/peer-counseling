import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KaderAvatarHeader } from "@/components/kader/KaderAvatarHeader";
import { StatusToggle } from "@/components/kader/StatusToggle";
import { BioEditor } from "@/components/kader/BioEditor";
import { TopicsEditor } from "@/components/kader/TopicsEditor";
import { Button } from "@/components/ui/Button";
import { signout } from "@/lib/auth/actions";
import type { KaderStatus, Topic } from "@/lib/student/types";

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
    .select("full_name, status, bio, topics")
    .eq("id", user.id)
    .single();

  const fullName = (profile?.full_name as string | null) ?? "Konselor";
  const status = (profile?.status as KaderStatus | null) ?? "offline";
  const bio = (profile?.bio as string | null) ?? null;
  const topics = (profile?.topics as Topic[] | null) ?? [];
  const avatarSeed = (user.user_metadata?.avatar_seed as string | null) ?? "kucing";

  return (
    <div className="flex flex-col gap-6">
      {/* ── Interactive Avatar Header Card ── */}
      <KaderAvatarHeader
        fullName={fullName}
        status={status}
        initialAvatarSeed={avatarSeed}
        topicCount={topics.length}
      />

      {/* ── Status ── */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-md">
        <h2 className="mb-4 text-headline-md text-on-surface">Status Kehadiran</h2>
        <StatusToggle status={status} />
      </div>

      {/* ── Bio ── */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-md">
        <h2 className="mb-4 text-headline-md text-on-surface">Bio Singkat</h2>
        <BioEditor bio={bio} />
      </div>

      {/* ── Topics ── */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest p-md">
        <h2 className="mb-2 text-headline-md text-on-surface">Topik Konsultasi Saya</h2>
        <p className="mb-4 text-body-md text-on-surface-variant">
          Pilih topik yang paling kamu kuasai untuk membantu adik kelas merasa lebih terhubung.
        </p>
        <TopicsEditor topics={topics} />
      </div>

      {/* ── Sign out ── */}
      <form action={signout} className="mt-2">
        <Button type="submit" variant="ghost" className="w-full text-error border-error/30 hover:bg-error-container/10">
          Keluar / Log Out
        </Button>
      </form>
    </div>
  );
}
