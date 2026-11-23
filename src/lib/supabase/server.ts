import { createServerClient } from "@supabase/ssr";
import type { AstroCookies } from "astro";

type CookieOptions = Parameters<AstroCookies["set"]>[2];

function parseCookieHeader(header: string) {
  if (!header) return [];

  return header.split(";").flatMap((part) => {
    const separator = part.indexOf("=");
    if (separator < 1) return [];

    const rawName = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1).trim();

    try {
      return [{ name: decodeURIComponent(rawName), value: decodeURIComponent(rawValue) }];
    } catch {
      return [{ name: rawName, value: rawValue }];
    }
  });
}

export function createSupabaseServerClient(request: Request, cookies: AstroCookies) {
  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.");
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get("cookie") ?? "");
      },
      setAll(values) {
        values.forEach(({ name, value, options }) => {
          cookies.set(name, value, options as CookieOptions);
        });
      },
    },
  });
}
