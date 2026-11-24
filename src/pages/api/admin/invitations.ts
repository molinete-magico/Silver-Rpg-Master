import { createHash, randomBytes } from "node:crypto";
import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user || auth.user.app_metadata.global_role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const code = randomBytes(32).toString("hex");
  const codeHash = createHash("sha256").update(code, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("invitations").insert({
    code_hash: codeHash, created_by: auth.user.id, expires_at: expiresAt, max_uses: 1,
  });
  if (error) return Response.json({ error: "Não foi possível criar o convite." }, { status: 400 });
  return Response.json({ code, expires_at: expiresAt });
};
