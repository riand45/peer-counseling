import { createClient } from "@/lib/supabase/server";
import { signout, verifyKader } from "@/app/login/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts sudah memastikan hanya user login yang sampai ke sini.
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_verified")
    .eq("id", user!.id)
    .single();

  const isGuru = profile?.role === "guru";

  // Daftar sesi konseling (RLS membatasi ke authenticated).
  const { data: sessions } = await supabase
    .from("counseling_sessions")
    .select("id, student_name, topic, message, status, created_at")
    .order("created_at", { ascending: false });

  // Guru: daftar kader yang belum diverifikasi.
  const { data: pendingKader } = isGuru
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("role", "kader")
        .eq("is_verified", false)
    : { data: null };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 p-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Peer Counseling</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {profile?.full_name || user!.email} · Peran:{" "}
            <span className="font-medium capitalize">{profile?.role}</span>
          </p>
        </div>
        <form action={signout}>
          <button className="rounded bg-foreground px-4 py-2 text-background">
            Keluar
          </button>
        </form>
      </header>

      {isGuru && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Verifikasi Kader</h2>
          {pendingKader && pendingKader.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {pendingKader.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center justify-between rounded border border-black/10 px-4 py-2 dark:border-white/15"
                >
                  <span>{k.full_name || "(tanpa nama)"}</span>
                  <form action={verifyKader}>
                    <input type="hidden" name="kader_id" value={k.id} />
                    <button className="rounded border border-black/15 px-3 py-1 text-sm dark:border-white/20">
                      Verifikasi
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-500">
              Tidak ada kader yang menunggu verifikasi.
            </p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Pengajuan Konseling</h2>
        {sessions && sessions.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="rounded border border-black/10 px-4 py-3 dark:border-white/15"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.student_name}</span>
                  <span className="text-xs uppercase text-zinc-500">
                    {s.status}
                  </span>
                </div>
                {s.topic && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Topik: {s.topic}
                  </p>
                )}
                {s.message && <p className="mt-1 text-sm">{s.message}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">Belum ada pengajuan.</p>
        )}
      </section>
    </main>
  );
}
