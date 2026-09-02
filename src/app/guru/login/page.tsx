import { login } from "@/lib/auth/actions";
import { LoginPage } from "@/components/auth/LoginPage";

function GuruIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default async function GuruLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <LoginPage
      role="guru"
      title="Masuk sebagai Guru"
      subtitle="Pantau dan dampingi konsultasi murid."
      accent="tertiary"
      icon={<GuruIcon />}
      iconBg="bg-gradient-to-br from-tertiary to-tertiary/70 text-white shadow-tertiary/30"
      loginAction={login}
      registerHref="/guru/daftar"
      error={error}
      message={message}
    />
  );
}
