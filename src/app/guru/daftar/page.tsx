import { signupGuru } from "@/lib/auth/actions";
import { RegisterPage } from "@/components/auth/RegisterPage";

function GuruIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2 4 5v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V5l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default async function GuruDaftarPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;

  return (
    <RegisterPage
      role="guru"
      title="Daftar sebagai Guru"
      subtitle="Buat akun untuk memantau dan mendampingi konsultasi murid."
      accent="tertiary"
      icon={<GuruIcon />}
      iconBg="bg-tertiary text-on-tertiary"
      signupAction={signupGuru}
      loginHref="/guru/login"
      error={error}
      message={message}
    />
  );
}
