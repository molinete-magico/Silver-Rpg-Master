import { createHash } from "node:crypto";
import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const code = String(form.get("code") ?? "").trim().toLowerCase();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const displayName = String(form.get("display_name") ?? "").trim();
  const password = String(form.get("password") ?? "");

  if (!/^[a-f0-9]{64}$/.test(code) || !email || !displayName || displayName.length > 48 || password.length < 8) {
    return redirect("/convite?erro=invalid", 303);
  }

  const inviteCodeHash = createHash("sha256").update(code, "utf8").digest("hex");
  try {
    const supabase = createSupabaseServerClient(request, cookies);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName, invite_code_hash: inviteCodeHash } },
    });
    if (error) return redirect("/convite?erro=invalid", 303);
    return redirect("/entrar?cadastro=confirmar", 303);
  } catch {
    return redirect("/entrar?motivo=configuracao", 303);
  }
};
