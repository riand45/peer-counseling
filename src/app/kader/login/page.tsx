import { login, signupKader } from "@/lib/auth/actions";
import { LoginCard } from "@/components/auth/LoginCard";

function KaderIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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
    <LoginCard
      title="Masuk sebagai Kader"
      subtitle="Untuk pendamping sebaya yang sudah terdaftar."
      accent="primary"
      icon={<KaderIcon />}
      redirectTo="/kader/login"
      loginAction={login}
      signupAction={signupKader}
      error={error}
      message={message}
    />
  );
}
