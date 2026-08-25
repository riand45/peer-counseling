import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signout } from "@/app/login/actions";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Peer Counseling</h1>

      {user ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Masuk sebagai <span className="font-medium">{user.email}</span>
          </p>
          <form action={signout}>
            <button className="rounded bg-foreground px-4 py-2 text-background">
              Keluar
            </button>
          </form>
        </div>
      ) : (
        <Link
          href="/login"
          className="rounded bg-foreground px-4 py-2 text-background"
        >
          Masuk
        </Link>
      )}
    </main>
  );
}
