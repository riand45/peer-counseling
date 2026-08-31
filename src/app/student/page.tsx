"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createStudentIdentity } from "@/lib/student/actions";
import { getStudentLocalId, setStudentLocalId } from "@/lib/student/identity";

export default function StudentWelcomePage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [nickname, setNickname] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = getStudentLocalId();
    if (existing) {
      router.replace("/student/cerita-saya");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deferring a client-only localStorage read to avoid a server/client hydration mismatch; not a cascading-render risk (fires once per mount)
    setReady(true);
  }, [router]);

  async function handleStart() {
    setSubmitting(true);
    setError(null);
    try {
      const localId = crypto.randomUUID();
      await createStudentIdentity({ localId, nickname: nickname.trim() || undefined });
      setStudentLocalId(localId);
      router.push("/student/topik");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memulai, coba lagi");
      setSubmitting(false);
    }
  }

  if (!ready) {
    return null;
  }

  return (
    <main className="flex min-h-screen items-start justify-center py-8 px-4">
      {/* Card container */}
      <div className="w-full max-w-[26rem] bg-white rounded-3xl shadow-xl overflow-hidden">

        {/* Hero image section */}
        <div className="relative w-full h-52 bg-[#dce8f5] overflow-hidden">
          <Image
            src="/hero-illustration.jpg"
            alt="Ilustrasi tiga mahasiswa berdiskusi di ruangan yang nyaman"
            fill
            className="object-cover object-center"
            priority
          />
        </div>

        {/* Content section */}
        <div className="px-6 pt-6 pb-7 flex flex-col gap-5">

          {/* Heading */}
          <div className="text-center">
            <h1 className="text-[1.65rem] font-extrabold text-[#0d1b2e] leading-tight tracking-tight">
              Halo, kamu tidak sendiri.
            </h1>
            <p className="mt-2 text-[0.95rem] text-[#5a6a7a] leading-relaxed">
              Identitasmu tidak perlu diketahui untuk mulai bercerita.
            </p>
          </div>

          {/* Safety notice */}
          <div className="flex items-start gap-3 bg-[#f0f5fc] rounded-2xl px-4 py-3.5">
            <div className="shrink-0 w-9 h-9 bg-[#2563eb] rounded-xl flex items-center justify-center text-white text-base">
              🛡️
            </div>
            <p className="text-[0.85rem] text-[#3a4a5c] leading-relaxed pt-0.5">
              Percakapan dapat dilihat oleh guru/BK untuk membantu menjaga keamanan.
            </p>
          </div>

          {/* Nickname input */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="nickname-input"
              className="text-[0.85rem] font-semibold text-[#3a4a5c]"
            >
              Nama Panggilan (Opsional)
            </label>
            <div className="flex items-center gap-2.5 bg-[#f0f5fc] rounded-2xl px-4 py-3 border-2 border-transparent focus-within:border-[#2563eb] transition-colors">
              <span className="text-xl shrink-0">😊</span>
              <input
                id="nickname-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Ketik nama panggilanmu..."
                className="flex-1 bg-transparent text-[0.9rem] text-[#0d1b2e] placeholder-[#9aabbf] outline-none"
              />
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-[0.85rem] text-red-700">
              <span className="shrink-0">⚠️</span>
              <p>{error}</p>
            </div>
          )}

          {/* CTA Button */}
          <button
            id="start-anonymous-btn"
            onClick={handleStart}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-3 bg-[#1a4db5] hover:bg-[#1640a0] active:bg-[#133490] disabled:opacity-60 disabled:pointer-events-none text-white font-bold text-[1rem] rounded-2xl py-4 transition-all duration-200 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
          >
            {submitting ? (
              <>
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Memulai...
              </>
            ) : (
              <>
                Mulai Secara Anonim
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.638L10.23 5.29a.75.75 0 1 1 1.04-1.08l5.5 5.25a.75.75 0 0 1 0 1.08l-5.5 5.25a.75.75 0 1 1-1.04-1.08l4.158-3.96H3.75A.75.75 0 0 1 3 10Z" clipRule="evenodd" />
                </svg>
              </>
            )}
          </button>

        </div>
      </div>
    </main>
  );
}
