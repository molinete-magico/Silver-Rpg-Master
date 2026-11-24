import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return new Response("Unauthorized", { status: 401 });

  const body = await request.json().catch(() => ({})) as { room_id?: string };
  const roomId = String(body.room_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return new Response("Invalid room", { status: 400 });

  const { data: existing } = await supabase.from("screen_share_requests").select("id,status")
    .eq("room_id", roomId).eq("requester_id", auth.user.id).eq("status", "pending")
    .limit(1).maybeSingle();
  if (existing) return Response.json({ request_id: existing.id, status: existing.status });

  const { data, error } = await supabase.from("screen_share_requests")
    .insert({ room_id: roomId, requester_id: auth.user.id, status: "pending" })
    .select("id,status").single();
  if (error || !data) return Response.json({ error: "Não foi possível solicitar o compartilhamento." }, { status: 400 });
  return Response.json({ request_id: data.id, status: data.status });
};
