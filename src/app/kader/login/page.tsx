import { login } from "@/lib/auth/actions";
import { LoginPage } from "@/components/auth/LoginPage";

function KaderIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

export default async function KaderLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <LoginPage
      role="kader"
      title="Masuk sebagai Konselor"
      subtitle="Pendamping sebaya yang mendampingi teman-temannya."
      accent="primary"
      icon={<KaderIcon />}
      iconBg="bg-primary text-on-primary"
      loginAction={login}
      registerHref="/kader/daftar"
      error={error}
      message={message}
    />
  );
}
