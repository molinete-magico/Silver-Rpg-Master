import { createHash, randomBytes } from "node:crypto";
import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const GET: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || auth.user?.app_metadata.global_role !== "admin") return new Response("Forbidden", { status: 403 });
  const { data, error } = await supabase.rpc("list_access_tokens");
  if (error) return Response.json({ error: "Não foi possível carregar os tokens." }, { status: 400 });
  return Response.json({ tokens: data ?? [] });
};

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || auth.user?.app_metadata.global_role !== "admin") return new Response("Forbidden", { status: 403 });

  const body = await request.json().catch(() => ({})) as { label?: string };
  const label = String(body.label ?? "Acesso compartilhado").trim().slice(0, 80) || "Acesso compartilhado";
  const code = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(code, "utf8").digest("hex");
  const { data: id, error } = await supabase.rpc("create_access_token", {
    p_token_hash: tokenHash,
    p_label: label,
  });
  if (error || !id) return Response.json({ error: "Não foi possível gerar o token." }, { status: 400 });
  return Response.json({ token: { id, label }, code });
};
