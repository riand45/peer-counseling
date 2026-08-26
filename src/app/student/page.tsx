"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const STORAGE_KEY = "pc_student";

type StudentIdentity = {
  name: string;
  localId: string;
};

function loadIdentity(): StudentIdentity | null {
  // localStorage hanya tersedia di browser (aman saat SSR).
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StudentIdentity;
  } catch {
    return null;
  }
}

export default function StudentPage() {
  // Hidrasi identitas anonymous lewat lazy initializer (bukan useEffect),
  // sehingga tidak memicu setState di dalam effect.
  const [identity, setIdentity] = useState<StudentIdentity | null>(loadIdentity);
  const [name, setName] = useState(() => loadIdentity()?.name ?? "");
  const [topic, setTopic] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");

    // Buat / pakai identitas anonymous. Nama tetap tercatat di DB,
    // sedangkan identitas hanya disimpan lokal di perangkat student.
    // localId dipertahankan lintas pengajuan; nama selalu memakai input terbaru.
    const current: StudentIdentity = {
      name: name.trim(),
      localId: identity?.localId ?? crypto.randomUUID(),
    };

    const supabase = createClient();
    const { error } = await supabase.from("counseling_sessions").insert({
      student_name: current.name,
      student_local_id: current.localId,
      topic: topic.trim() || null,
      message: message.trim() || null,
    });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    // Simpan/segarkan identitas di localStorage.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    setIdentity(current);
    setTopic("");
    setMessage("");
    setStatus("sent");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Ajukan Konseling</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Tanpa perlu login. Nama Anda hanya disimpan di perangkat ini.
        </p>
      </div>

      {status === "sent" && (
        <p className="rounded bg-green-500/10 px-3 py-2 text-sm text-green-700 dark:text-green-400">
          Terima kasih, {identity?.name}. Pengajuan Anda sudah tercatat.
        </p>
      )}

      {status === "error" && (
        <p className="rounded bg-red-500/10 px-3 py-2 text-sm text-red-600">
          Gagal mengirim: {errorMsg}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Nama
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Nama panggilan"
            className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Topik
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="mis. akademik, pertemanan"
            className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Pesan
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Ceritakan yang ingin Anda konsultasikan…"
            className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
          />
        </label>

        <button
          type="submit"
          disabled={status === "sending"}
          className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-60"
        >
          {status === "sending" ? "Mengirim…" : "Kirim"}
        </button>
      </form>
    </main>
  );
}
