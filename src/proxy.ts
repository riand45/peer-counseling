import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16: konvensi `middleware.ts` telah di-deprecate dan diganti
 * menjadi `proxy.ts`. File ini menjalankan refresh session Supabase
 * sebelum request mencapai route.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Cocokkan semua path KECUALI:
     * - _next/static (file statis)
     * - _next/image (optimasi gambar)
     * - favicon.ico dan file gambar statis
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
