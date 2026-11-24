import { RoomServiceClient } from "livekit-server-sdk";
import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return new Response("Unauthorized", { status: 401 });

  const body = await request.json().catch(() => ({})) as { request_id?: string };
  const requestId = String(body.request_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return new Response("Invalid request", { status: 400 });

  const { data: shareRequest } = await supabase.from("screen_share_requests")
    .select("id,room_id,requester_id,status").eq("id", requestId)
    .eq("requester_id", auth.user.id).eq("status", "approved").maybeSingle();
  if (!shareRequest) return new Response("Approved request not found", { status: 404 });

  const host = import.meta.env.LIVEKIT_URL;
  const apiKey = import.meta.env.LIVEKIT_API_KEY;
  const apiSecret = import.meta.env.LIVEKIT_API_SECRET;
  if (!host || !apiKey || !apiSecret) return new Response("LiveKit is not configured", { status: 503 });

  const service = new RoomServiceClient(host.replace(/^wss:/, "https:"), apiKey, apiSecret);
  try {
    await service.updateParticipant(shareRequest.room_id, auth.user.id, {
      permission: { canPublish: false, canPublishData: false, canSubscribe: true, canPublishSources: [] },
    });
    await service.removeParticipant(shareRequest.room_id, auth.user.id);
  } catch {
    // The participant may have already disconnected or stopped sharing.
  }

  const { error } = await supabase.from("screen_share_requests").update({ status: "stopped" })
    .eq("id", requestId).eq("requester_id", auth.user.id).eq("status", "approved");
  if (error) return Response.json({ error: "O compartilhamento foi interrompido, mas o estado não foi atualizado." }, { status: 400 });
  return Response.json({ success: true });
};
