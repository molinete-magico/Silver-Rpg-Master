import { AccessToken } from "livekit-server-sdk";
import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return new Response("Unauthorized", { status: 401 });

  const body = await request.json().catch(() => ({})) as { room_id?: string; publish?: boolean };
  const roomId = String(body.room_id ?? "");
  const wantsPublish = body.publish === true;
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return new Response("Invalid room", { status: 400 });

  const { data: membership } = await supabase.from("room_members").select("role")
    .eq("room_id", roomId).eq("user_id", auth.user.id).maybeSingle();
  if (!membership) return new Response("Forbidden", { status: 403 });

  let canPublish = false;
  if (wantsPublish && membership.role === "gm") {
    canPublish = true;
  } else if (wantsPublish) {
    const { data: approval } = await supabase.from("screen_share_requests").select("id")
      .eq("room_id", roomId).eq("requester_id", auth.user.id).eq("status", "approved")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    canPublish = Boolean(approval);
  }

  const livekitUrl = import.meta.env.LIVEKIT_URL;
  const apiKey = import.meta.env.LIVEKIT_API_KEY;
  const apiSecret = import.meta.env.LIVEKIT_API_SECRET;
  if (!livekitUrl || !apiKey || !apiSecret) {
    return Response.json({ error: "O compartilhamento ainda não está configurado neste ambiente." }, { status: 503 });
  }

  const token = new AccessToken(apiKey, apiSecret, { identity: auth.user.id, ttl: "5m" });
  token.addGrant({
    roomJoin: true,
    room: roomId,
    canSubscribe: true,
    canPublish: canPublish,
    canPublishData: false,
    ...(canPublish ? { canPublishSources: ["screen_share", "screen_share_audio"] } : {}),
  });

  return Response.json({ url: livekitUrl, token: await token.toJwt(), canPublish });
};
