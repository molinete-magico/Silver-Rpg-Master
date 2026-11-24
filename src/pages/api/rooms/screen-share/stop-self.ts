import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return new Response("Unauthorized", { status: 401 });

  const body = await request.json().catch(() => ({})) as { request_id?: string };
  const requestId = String(body.request_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) return new Response("Invalid request", { status: 400 });

  const { error } = await supabase.from("screen_share_requests").update({ status: "stopped" })
    .eq("id", requestId).eq("requester_id", auth.user.id).eq("status", "approved");
  if (error) return Response.json({ error: "Não foi possível encerrar a solicitação." }, { status: 400 });
  return Response.json({ success: true });
};
