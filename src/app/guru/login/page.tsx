import { login, signupGuru } from "@/lib/auth/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default async function GuruLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-sm">
      <Card className="w-full max-w-md">
        <h1 className="text-headline-md font-bold text-on-surface">Masuk sebagai Guru BK</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Untuk guru BK yang memantau dan mendampingi.
        </p>

        {error && (
          <p className="mt-4 rounded-md bg-error-container px-3 py-2 text-label-md text-on-error-container">
            {error}
          </p>
        )}

        {message === "confirm-email" && (
          <p className="mt-4 rounded-md bg-secondary-container px-3 py-2 text-label-md text-on-secondary-container">
            Pendaftaran berhasil — silakan cek email Anda untuk konfirmasi
            sebelum masuk.
          </p>
        )}

        <form className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="redirect_to" value="/guru/login" />
          <label className="flex flex-col gap-1 text-label-md text-on-surface">
            Nama lengkap
            <input
              name="full_name"
              type="text"
              className="rounded-md border border-outline-variant px-3 py-2 text-body-md"
            />
          </label>
          <label className="flex flex-col gap-1 text-label-md text-on-surface">
            Email
            <input
              name="email"
              type="email"
              required
              className="rounded-md border border-outline-variant px-3 py-2 text-body-md"
            />
          </label>
          <label className="flex flex-col gap-1 text-label-md text-on-surface">
            Password
            <input
              name="password"
              type="password"
              required
              minLength={6}
              className="rounded-md border border-outline-variant px-3 py-2 text-body-md"
            />
          </label>

          <div className="mt-2 flex gap-3">
            <Button formAction={login} className="flex-1">
              Masuk
            </Button>
            <Button formAction={signupGuru} variant="secondary" className="flex-1">
              Daftar
            </Button>
          </div>
        </form>
      </Card>
    </main>
  );
}
