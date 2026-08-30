import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PasswordField } from "@/components/ui/PasswordField";
import { cn } from "@/lib/cn";

type FormAction = (formData: FormData) => void | Promise<void>;

type LoginCardProps = {
  title: string;
  subtitle: string;
  accent: "primary" | "tertiary";
  icon: ReactNode;
  redirectTo: string;
  loginAction: FormAction;
  signupAction: FormAction;
  error?: string;
  message?: string;
};

const accentClasses: Record<LoginCardProps["accent"], string> = {
  primary: "bg-primary text-on-primary",
  tertiary: "bg-tertiary text-on-tertiary",
};

const inputClasses =
  "rounded-md border-2 border-transparent bg-surface-container-low px-3 py-2.5 text-body-md text-on-surface outline-none transition-colors focus:border-primary focus:bg-surface-container-lowest";

export function LoginCard({
  title,
  subtitle,
  accent,
  icon,
  redirectTo,
  loginAction,
  signupAction,
  error,
  message,
}: LoginCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-sm">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1 text-label-md font-semibold text-on-surface-variant transition-colors hover:text-on-surface"
        >
          <span aria-hidden="true">←</span> Ruang Cerita
        </Link>

        <Card className="shadow-[0_20px_45px_-20px_rgba(0,93,167,0.25)]">
          <div
            aria-hidden="true"
            className={cn("flex h-12 w-12 items-center justify-center rounded-full", accentClasses[accent])}
          >
            {icon}
          </div>

          <h1 className="mt-4 text-headline-md font-bold text-on-surface">{title}</h1>
          <p className="mt-1 text-body-md text-on-surface-variant">{subtitle}</p>

          {error && (
            <p className="mt-4 rounded-md border-l-4 border-error bg-error-container px-3 py-2 text-label-md text-on-error-container">
              {error}
            </p>
          )}

          {message === "confirm-email" && (
            <p className="mt-4 rounded-md border-l-4 border-secondary bg-secondary-container px-3 py-2 text-label-md text-on-secondary-container">
              Pendaftaran berhasil — silakan cek email Anda untuk konfirmasi sebelum masuk.
            </p>
          )}

          <form className="mt-6 flex flex-col gap-4">
            <input type="hidden" name="redirect_to" value={redirectTo} />
            <label className="flex flex-col gap-1 text-label-md font-semibold text-on-surface">
              Nama lengkap
              <input name="full_name" type="text" className={inputClasses} />
            </label>
            <label className="flex flex-col gap-1 text-label-md font-semibold text-on-surface">
              Email
              <input name="email" type="email" required className={inputClasses} />
            </label>
            <PasswordField label="Password" name="password" required minLength={6} />

            <div className="mt-2 flex flex-col gap-3">
              <Button formAction={loginAction} className="w-full">
                Masuk
              </Button>

              <div className="flex items-center gap-3 text-label-sm text-on-surface-variant">
                <span className="h-px flex-1 bg-outline-variant" aria-hidden="true" />
                atau
                <span className="h-px flex-1 bg-outline-variant" aria-hidden="true" />
              </div>

              <Button formAction={signupAction} variant="secondary" className="w-full">
                Daftar
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </main>
  );
}
