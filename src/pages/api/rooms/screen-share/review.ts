import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return new Response("Unauthorized", { status: 401 });

  const body = await request.json().catch(() => ({})) as { request_id?: string; status?: string };
  const requestId = String(body.request_id ?? "");
  const status = body.status;
  if (!/^[0-9a-f-]{36}$/i.test(requestId) || !["approved", "denied"].includes(String(status))) {
    return new Response("Invalid request", { status: 400 });
  }

  const { data: pending } = await supabase.from("screen_share_requests").select("id,room_id,status")
    .eq("id", requestId).eq("status", "pending").maybeSingle();
  if (!pending) return new Response("Request not found", { status: 404 });

  const { data: membership } = await supabase.from("room_members").select("role")
    .eq("room_id", pending.room_id).eq("user_id", auth.user.id).maybeSingle();
  if (membership?.role !== "gm") return new Response("Forbidden", { status: 403 });

  const { error } = await supabase.from("screen_share_requests").update({
    status, reviewed_by: auth.user.id, reviewed_at: new Date().toISOString(),
  }).eq("id", requestId).eq("status", "pending");
  if (error) return Response.json({ error: "Não foi possível atualizar a solicitação." }, { status: 400 });
  return Response.json({ success: true });
};
