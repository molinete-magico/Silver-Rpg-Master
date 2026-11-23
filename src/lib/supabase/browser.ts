import { createBrowserClient } from "@supabase/ssr";

export function createSupabaseBrowserClient() {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase browser configuration is missing.");
  return createBrowserClient(url, key);
}
