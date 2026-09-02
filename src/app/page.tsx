import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function LandingPage() {
  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center p-sm md:p-md bg-cover bg-center bg-no-repeat overflow-hidden"
      style={{ backgroundImage: "url('/portal_background.jpg')" }}
    >
      {/* Soft overlay for background blending and text readability */}
      <div className="absolute inset-0 bg-white/25 backdrop-blur-[6px] pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 flex flex-col items-center max-w-4xl w-full gap-8 md:gap-12 py-10">
        
        {/* Header section with brand badge and typography */}
        <div className="text-center flex flex-col items-center max-w-2xl px-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary mb-4 animate-fade-in shadow-sm shadow-primary/5">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-bold tracking-wider uppercase">Portal Layanan Konseling Sebaya</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 drop-shadow-sm leading-tight">
            Ruang Cerita
          </h1>
          
          <p className="mt-3.5 text-md md:text-lg text-slate-700 font-medium leading-relaxed">
            Safe space untuk bercerita secara anonim, didengar oleh konselor sebaya, dan didampingi guru.
          </p>
        </div>

        {/* Roles Grid */}
        <div className="grid w-full max-w-4xl gap-6 sm:grid-cols-3 px-4">
          
          {/* Card: Siswa (Student) */}
          <div className="relative flex flex-col justify-between gap-5 p-7 bg-white/80 border border-white/60 rounded-2xl shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1.5 transition-all duration-300 text-center group">
            <div className="flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center text-primary group-hover:scale-110 transition-transform duration-300 shadow-inner">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Murid</h2>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Cerita secara anonim, aman, dan rahasia tanpa perlu mendaftar akun.
                </p>
              </div>
            </div>
            <Link href="/student" className="w-full mt-2">
              <Button className="w-full rounded-xl py-3 bg-primary text-white hover:bg-primary-container font-semibold shadow-md hover:shadow-lg transition-all duration-300 cursor-pointer">
                Mulai Cerita
              </Button>
            </Link>
          </div>

          {/* Card: Kader (Peer Counselor) */}
          <div className="relative flex flex-col justify-between gap-5 p-7 bg-white/80 border border-white/60 rounded-2xl shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-emerald-100/50 hover:-translate-y-1.5 transition-all duration-300 text-center group">
            <div className="flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform duration-300 shadow-inner">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Konselor Sebaya</h2>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Masuk sebagai konselor sebaya untuk mendampingi dan mendengarkan keluh kesah murid.
                </p>
              </div>
            </div>
            <Link href="/kader/login" className="w-full mt-2">
              <Button variant="ghost" className="w-full rounded-xl py-3 border border-slate-200 hover:border-emerald-200 hover:bg-emerald-50/50 hover:text-emerald-700 text-slate-700 font-semibold shadow-sm transition-all duration-300 cursor-pointer">
                Masuk Konselor
              </Button>
            </Link>
          </div>

          {/* Card: Guru BK (Teacher) */}
          <div className="relative flex flex-col justify-between gap-5 p-7 bg-white/80 border border-white/60 rounded-2xl shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-amber-100/50 hover:-translate-y-1.5 transition-all duration-300 text-center group">
            <div className="flex flex-col items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform duration-300 shadow-inner">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Guru</h2>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  Masuk sebagai guru bimbingan konseling untuk memantau, mengawasi, dan mendampingi murid.
                </p>
              </div>
            </div>
            <Link href="/guru/login" className="w-full mt-2">
              <Button variant="ghost" className="w-full rounded-xl py-3 border border-slate-200 hover:border-amber-200 hover:bg-amber-50/50 hover:text-amber-700 text-slate-700 font-semibold shadow-sm transition-all duration-300 cursor-pointer">
                Masuk Guru
              </Button>
            </Link>
          </div>

        </div>

        {/* Footer */}
        <p className="text-xs text-slate-500 font-medium mt-4 select-none">
          &copy; {new Date().getFullYear()} Ruang Cerita. Dikelola oleh Tim Bimbingan Konseling.
        </p>

      </div>
    </main>
  );
}

