import type { ReactNode } from "react";
import Link from "next/link";
import { AuthLayout } from "./AuthLayout";
import { AuthCard } from "./AuthCard";
import { AuthInput } from "./AuthInput";
import { AuthPasswordField } from "./AuthPasswordField";
import { Button } from "@/components/ui/Button";

type FormAction = (formData: FormData) => void | Promise<void>;

type LoginPageProps = {
  role: "kader" | "guru";
  title: string;
  subtitle: string;
  accent: "primary" | "tertiary";
  icon: ReactNode;
  iconBg: string;
  loginAction: FormAction;
  registerHref: string;
  error?: string;
  message?: string;
};

const EmailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

export function LoginPage({
  role,
  title,
  subtitle,
  accent,
  icon,
  iconBg,
  loginAction,
  registerHref,
  error,
  message,
}: LoginPageProps) {
  const redirectTo = role === "guru" ? "/guru/login" : "/kader/login";

  return (
    <AuthLayout accent={accent}>
      <AuthCard
        icon={icon}
        iconBg={iconBg}
        title={title}
        subtitle={subtitle}
        error={error}
        message={message}
      >
        <form className="mt-6 flex flex-col gap-4" action={loginAction} aria-label="Form masuk">
          <input type="hidden" name="redirect_to" value={redirectTo} />

          <AuthInput
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="nama@email.com"
            icon={<EmailIcon />}
          />

          <AuthPasswordField name="password" required minLength={6} />

          <div className="mt-2">
            <Button
              type="submit"
              id={`${role}-login-btn`}
              className="w-full rounded-xl py-3 text-base font-semibold shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98]"
            >
              Masuk
            </Button>
          </div>
        </form>

        <div className="mt-6 flex items-center gap-3 text-label-sm text-on-surface-variant">
          <span className="h-px flex-1 bg-outline-variant" aria-hidden="true" />
          Belum punya akun?
          <span className="h-px flex-1 bg-outline-variant" aria-hidden="true" />
        </div>

        <div className="mt-3">
          <Link
            href={registerHref}
            id={`${role}-register-link`}
            className="flex w-full items-center justify-center rounded-xl border-2 border-outline-variant bg-transparent px-4 py-3 text-label-md font-semibold text-on-surface transition-all hover:border-primary/50 hover:bg-surface-container-low"
          >
            Daftar Sekarang
          </Link>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
