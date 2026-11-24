import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || auth.user?.app_metadata.global_role !== "admin") return new Response("Forbidden", { status: 403 });

  const body = await request.json().catch(() => ({})) as { id?: string };
  const id = String(body.id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Token inválido." }, { status: 400 });

  const { data, error } = await supabase.rpc("revoke_access_token", { p_token_id: id });
  if (error || !data) return Response.json({ error: "Não foi possível revogar o token." }, { status: 400 });
  return Response.json({ success: true });
};
