import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** Deterministic color palette */
const AVATAR_COLORS = [
  { ring: "#d4e3ff", bg: "#d4e3ff", text: "#001c39" },
  { ring: "#cde5ff", bg: "#cde5ff", text: "#001d32" },
  { ring: "#d2e6ef", bg: "#d2e6ef", text: "#0b1e24" },
  { ring: "#2976c7", bg: "#2976c7", text: "#fdfcff" },
  { ring: "#6cbdfe", bg: "#6cbdfe", text: "#004b75" },
  { ring: "#65777f", bg: "#65777f", text: "#fafdff" },
];

function pickColorIndex(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % AVATAR_COLORS.length;
}

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
  const colorIdx = pickColorIndex(fullName.trim() || "G");
  const color = AVATAR_COLORS[colorIdx];

  return (
    <div className="flex flex-col gap-6">
      {/* ── Premium Avatar Header Card ── */}
      <div className="rounded-2xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
        {/* gradient banner */}
        <div
          className="h-24 w-full"
          style={{
            background: `linear-gradient(135deg, ${color.ring}cc 0%, ${color.bg}66 100%)`,
          }}
        />
        {/* avatar + info */}
        <div className="px-md pb-md -mt-10 flex flex-col items-center text-center">
          <div
            className="h-20 w-20 rounded-full ring-4 ring-surface-container-lowest shadow-md flex items-center justify-center text-headline-lg font-bold shrink-0"
            style={{ background: color.bg, color: color.text }}
            aria-hidden="true"
          >
            {initial}
          </div>

          <h1 className="mt-3 text-headline-md font-bold text-on-surface">Pak/Bu {fullName}</h1>

          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-label-sm font-semibold bg-primary-fixed-dim text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            Guru BK
          </span>
        </div>
      </div>

      <p className="text-body-md text-on-surface-variant">
        Pengaturan profil tambahan akan tersedia pada pembaruan berikutnya.
      </p>
    </div>
  );
}
