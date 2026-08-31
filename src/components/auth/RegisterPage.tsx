import type { ReactNode } from "react";
import Link from "next/link";
import { AuthLayout } from "./AuthLayout";
import { AuthCard } from "./AuthCard";
import { AuthInput } from "./AuthInput";
import { AuthPasswordField } from "./AuthPasswordField";
import { AuthSubmitButton } from "./AuthSubmitButton";

type FormAction = (formData: FormData) => void | Promise<void>;

type RegisterPageProps = {
  role: "kader" | "guru";
  title: string;
  subtitle: string;
  accent: "primary" | "tertiary";
  icon: ReactNode;
  iconBg: string;
  signupAction: FormAction;
  loginHref: string;
  error?: string;
  message?: string;
};

const UserIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M19 21a7 7 0 1 0-14 0" />
    <circle cx="12" cy="8" r="4" />
  </svg>
);

const EmailIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect width="20" height="16" x="2" y="4" rx="2" />
    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
  </svg>
);

const UserPlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <line x1="19" x2="19" y1="8" y2="14" />
    <line x1="22" x2="16" y1="11" y2="11" />
  </svg>
);

export function RegisterPage({
  role,
  title,
  subtitle,
  accent,
  icon,
  iconBg,
  signupAction,
  loginHref,
  error,
  message,
}: RegisterPageProps) {
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
        <form className="mt-6 flex flex-col gap-4" action={signupAction} aria-label="Form pendaftaran">
          <AuthInput
            label="Nama Lengkap"
            name="full_name"
            type="text"
            required
            autoComplete="name"
            placeholder="Nama lengkap Anda"
            accent={accent}
            icon={<UserIcon />}
          />

          <AuthInput
            label="Email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="nama@email.com"
            accent={accent}
            icon={<EmailIcon />}
          />

          <AuthPasswordField
            name="password"
            required
            minLength={6}
            hint="Minimal 6 karakter"
            accent={accent}
          />

          <div className="mt-2">
            <AuthSubmitButton
              id={`${role}-signup-btn`}
              accent={accent}
              loadingText="Sedang mendaftar..."
              icon={<UserPlusIcon />}
            >
              Daftar
            </AuthSubmitButton>
          </div>
        </form>

        <div className="mt-6 flex items-center gap-3 text-label-sm text-on-surface-variant">
          <span className="h-px flex-1 bg-outline-variant" aria-hidden="true" />
          Sudah punya akun?
          <span className="h-px flex-1 bg-outline-variant" aria-hidden="true" />
        </div>

        <div className="mt-3">
          <Link
            href={loginHref}
            id={`${role}-login-link`}
            className="flex w-full items-center justify-center rounded-xl bg-surface-container-low px-4 py-3 text-label-md font-semibold text-on-surface transition-all hover:bg-surface-container-high"
          >
            Masuk
          </Link>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}
