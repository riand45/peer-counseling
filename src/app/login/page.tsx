import { login, signup } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-black/10 p-6 dark:border-white/15">
        <h1 className="text-xl font-semibold">Masuk</h1>

        {error && (
          <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <label className="flex flex-col gap-1 text-sm">
          Email
          <input
            id="email"
            name="email"
            type="email"
            required
            className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Password
          <input
            id="password"
            name="password"
            type="password"
            required
            className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>

        <div className="flex gap-2">
          <button
            formAction={login}
            className="flex-1 rounded bg-foreground px-4 py-2 text-background"
          >
            Masuk
          </button>
          <button
            formAction={signup}
            className="flex-1 rounded border border-black/15 px-4 py-2 dark:border-white/20"
          >
            Daftar
          </button>
        </div>
      </form>
    </main>
  );
}
