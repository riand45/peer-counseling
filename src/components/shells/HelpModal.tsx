"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

type HelpModalProps = {
  open: boolean;
  onClose: () => void;
};

const FAQ_ITEMS = [
  {
    question: "Bagaimana cara memulai sesi konseling?",
    answer:
      "Buka menu 'Cari Teman Cerita' atau 'Cerita Saya', pilih konselor sebaya yang berstatus 'Tersedia', pilih topik yang sesuai dengan apa yang sedang kamu rasakan, lalu mulai percakapan langsung secara anonim.",
  },
  {
    question: "Apakah identitas dan cerita saya benar-benar aman?",
    answer:
      "Ya, 100% aman dan rahasia! Kamu menggunakan nama alias/anonim dan avatar pilihan. Identitas aslimu tidak dibagikan ke teman konselor. Percakapan hanya dibaca oleh kamu dan konselormu.",
  },
  {
    question: "Siapakah para konselor sebaya di Ruang Cerita?",
    answer:
      "Konselor sebaya adalah teman-teman sebaya terlatih yang telah dibekali keterampilan mendengarkan aktif dan empati di bawah bimbingan Guru Bimbingan Konseling (BK) sekolah.",
  },
  {
    question: "Kapan saya harus menghubungi bantuan profesional/darurat?",
    answer:
      "Jika kamu atau temanmu berada dalam situasi bahaya langsung, menyakiti diri, atau ancaman kekerasan, harap segera temui Guru BK di sekolah atau hubungi hotline darurat kesehatan mental terdekat.",
  },
];

export function HelpModal({ open, onClose }: HelpModalProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full  rounded-2xl bg-surface-container-lowest shadow-2xl border border-outline-variant flex flex-col max-h-[80vh] overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-outline-variant bg-surface-container-lowest shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-container text-on-secondary-container">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h2 id="help-title" className="text-label-lg font-bold text-on-surface">
                Bantuan & Panduan
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-container-low text-on-surface-variant transition-colors"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Hotline Alert */}
          <div className="p-3 rounded-xl bg-error-container/60 border border-error/20 flex items-start gap-2.5 text-on-error-container">
            <span className="text-lg">🚨</span>
            <div>
              <p className="text-label-sm font-bold text-error">Butuh Bantuan Mendesak?</p>
              <p className="text-body-xs text-on-error-container mt-0.5 leading-relaxed">
                Hubungi Hotline Kesehatan Mental Kemenkes <strong>119 ext 8</strong> atau hubungi Guru BK di sekolahmu.
              </p>
            </div>
          </div>

          {/* FAQ Accordion */}
          <div>
            <h3 className="text-label-md font-bold text-on-surface mb-1.5">Pertanyaan Umum (FAQ)</h3>
            <div className="space-y-1.5">
              {FAQ_ITEMS.map((item, idx) => {
                const isOpen = openIndex === idx;
                return (
                  <div
                    key={idx}
                    className="border border-outline-variant/70 rounded-xl overflow-hidden bg-surface-container-lowest"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenIndex(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between p-3 text-left text-label-sm font-semibold text-on-surface hover:bg-surface-container-low transition-colors"
                    >
                      <span>{item.question}</span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={cn("transition-transform duration-200 shrink-0 text-on-surface-variant", isOpen && "rotate-180")}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-1 text-body-xs text-on-surface-variant border-t border-outline-variant/30 leading-relaxed bg-surface-container-low/30">
                        {item.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-outline-variant/60 bg-surface-container-low/40 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-full bg-primary text-on-primary text-label-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Mengerti
          </button>
        </div>
      </div>
    </div>
  );
}
