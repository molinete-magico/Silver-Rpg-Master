import { createHash, randomBytes } from "node:crypto";
import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return new Response("Unauthorized", { status: 401 });

  const form = await request.formData();
  const roomId = String(form.get("room_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return new Response("Invalid room", { status: 400 });

  const { data: membership } = await supabase.from("room_members").select("role")
    .eq("room_id", roomId).eq("user_id", auth.user.id).maybeSingle();
  if (membership?.role !== "gm" && auth.user.app_metadata.global_role !== "admin") {
    return new Response("Forbidden", { status: 403 });
  }

  const code = randomBytes(32).toString("hex");
  const codeHash = createHash("sha256").update(code, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from("room_invites").insert({
    room_id: roomId, code_hash: codeHash, created_by: auth.user.id, expires_at: expiresAt, max_uses: 1,
  });
  if (error) return Response.json({ error: "Não foi possível criar o convite da sala." }, { status: 400 });
  return Response.json({ code, expires_at: expiresAt });
};
