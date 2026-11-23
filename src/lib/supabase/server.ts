import { createServerClient } from "@supabase/ssr";
import type { AstroCookies } from "astro";

type CookieOptions = Parameters<AstroCookies["set"]>[2];

export function createSupabaseServerClient(cookies: AstroCookies) {
  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(values) {
        values.forEach(({ name, value, options }) => {
          cookies.set(name, value, options as CookieOptions);
        });
      },
    },
  });
}
