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

  // Contoh proteksi rute: arahkan user yang belum login ke /login.
  // Sesuaikan atau hapus sesuai kebutuhan aplikasi Anda.
  if (
    !user &&
    !request.nextUrl.pathname.startsWith("/login") &&
    !request.nextUrl.pathname.startsWith("/auth")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // PENTING: kembalikan supabaseResponse apa adanya agar cookie tetap sinkron.
  return supabaseResponse;
}
