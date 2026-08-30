import { signupKader } from "@/lib/auth/actions";
import { RegisterPage } from "@/components/auth/RegisterPage";

function KaderIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="4" />
    </svg>
  );
}

export default async function KaderDaftarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <RegisterPage
      role="kader"
      title="Daftar sebagai Kader"
      subtitle="Bergabung sebagai pendamping sebaya untuk membantu teman."
      accent="primary"
      icon={<KaderIcon />}
      iconBg="bg-primary text-on-primary"
      signupAction={signupKader}
      loginHref="/kader/login"
      error={error}
      message={message}
    />
  );
}
