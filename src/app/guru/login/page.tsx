import { login, signupGuru } from "@/lib/auth/actions";
import { LoginCard } from "@/components/auth/LoginCard";

function GuruIcon() {
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
    <LoginCard
      title="Masuk sebagai Guru BK"
      subtitle="Untuk guru BK yang memantau dan mendampingi."
      accent="tertiary"
      icon={<GuruIcon />}
      redirectTo="/guru/login"
      loginAction={login}
      signupAction={signupGuru}
      error={error}
      message={message}
    />
  );
}
