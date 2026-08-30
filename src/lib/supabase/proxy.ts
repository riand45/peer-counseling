import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Me-refresh session Supabase pada setiap request dan meneruskan cookie
 * yang diperbarui ke request maupun response.
 *
 * Dipanggil dari `proxy.ts` (konvensi Next.js 16 pengganti middleware).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // PENTING: jangan menulis logika di antara createServerClient dan getUser().
  // getUser() memicu refresh token bila diperlukan.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Prefix yang boleh diakses TANPA login:
  // - /            : landing 3 pilihan peran
  // - /student     : area student anonymous (tanpa akun)
  // - /kader/login : login/daftar kader
  // - /guru/login  : login/daftar guru
  // - /auth        : callback OAuth/email confirmation
  const publicPrefixes = ["/student", "/kader/login", "/kader/daftar", "/guru/login", "/guru/daftar", "/auth"];
  const isPublicPath =
    pathname === "/" || publicPrefixes.some((prefix) => pathname.startsWith(prefix));

  // Ini hanya redirect optimistis (belum login sama sekali). Kecocokan role
  // (kader vs guru) dan status verifikasi dicek ulang dengan query DB di
  // masing-masing layout — proxy TIDAK cukup untuk itu (lihat catatan Next.js
  // 16: Server Actions di luar matcher proxy tidak ikut tersaring proxy).
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith("/guru") ? "/guru/login" : "/kader/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
