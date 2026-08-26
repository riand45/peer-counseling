import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-surface p-sm">
      <div className="text-center">
        <h1 className="text-headline-lg font-bold text-on-surface">Ruang Cerita</h1>
        <p className="mt-2 text-body-lg text-on-surface-variant">
          Safe space untuk cerita, didengar, dan didampingi.
        </p>
      </div>

      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-3">
        <Card className="flex flex-col items-center gap-3 text-center">
          <p className="text-headline-md font-semibold text-on-surface">Siswa</p>
          <p className="text-body-md text-on-surface-variant">
            Cerita secara anonim, tanpa perlu akun.
          </p>
          <Link href="/student" className="w-full">
            <Button className="w-full">Mulai Cerita</Button>
          </Link>
        </Card>

        <Card className="flex flex-col items-center gap-3 text-center">
          <p className="text-headline-md font-semibold text-on-surface">Kader</p>
          <p className="text-body-md text-on-surface-variant">
            Masuk untuk mendampingi siswa.
          </p>
          <Link href="/kader/login" className="w-full">
            <Button variant="secondary" className="w-full">
              Masuk Kader
            </Button>
          </Link>
        </Card>

        <Card className="flex flex-col items-center gap-3 text-center">
          <p className="text-headline-md font-semibold text-on-surface">Guru BK</p>
          <p className="text-body-md text-on-surface-variant">
            Masuk untuk memantau dan mendampingi.
          </p>
          <Link href="/guru/login" className="w-full">
            <Button variant="secondary" className="w-full">
              Masuk Guru BK
            </Button>
          </Link>
        </Card>
      </div>
    </main>
  );
}
