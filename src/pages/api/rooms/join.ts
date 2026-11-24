import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return redirect("/entrar", 303);

  const form = await request.formData();
  const roomId = String(form.get("room_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return redirect("/salas?erro=sessao", 303);

  const { data, error } = await supabase.rpc("join_open_room", { p_room_id: roomId });
  if (error || typeof data !== "string") return redirect("/salas?erro=sessao", 303);
  return redirect(`/salas/${data}`, 303);
};
