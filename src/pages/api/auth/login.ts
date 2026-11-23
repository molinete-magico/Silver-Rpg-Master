import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");

  if (!email || !password) {
    return new Response("Informe e-mail e senha.", { status: 400 });
  }

  try {
    const supabase = createSupabaseServerClient(request, cookies);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return redirect("/entrar?erro=credenciais", 303);
    }

    return redirect("/salas", 303);
  } catch {
    return redirect("/entrar?motivo=configuracao", 303);
  }
};
