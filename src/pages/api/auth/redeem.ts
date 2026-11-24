import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const code = String(form.get("code") ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(code)) return redirect("/entrar?erro=token", 303);

  try {
    const supabase = createSupabaseServerClient(request, cookies);
    const { data: current } = await supabase.auth.getUser();

    if (current.user?.app_metadata.global_role === "admin") return redirect("/salas", 303);

    if (!current.user) {
      const { error: signInError } = await supabase.auth.signInAnonymously();
      if (signInError?.code === "anonymous_provider_disabled") {
        return redirect("/entrar?motivo=anonimo", 303);
      }
      if (signInError) return redirect("/entrar?motivo=configuracao", 303);
    } else if (!current.user.is_anonymous) {
      return redirect("/entrar?erro=token", 303);
    }

    const tokenHash = createHash("sha256").update(code, "utf8").digest("hex");
    const { error } = await supabase.rpc("redeem_access_token", { p_token_hash: tokenHash });
    if (error) {
      await supabase.auth.signOut();
      return redirect("/entrar?erro=token", 303);
    }
    return redirect("/salas", 303);
  } catch {
    return redirect("/entrar?motivo=configuracao", 303);
  }
};
