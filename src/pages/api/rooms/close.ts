import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return redirect("/entrar", 303);
  const form = await request.formData();
  const roomId = String(form.get("room_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(roomId)) return redirect("/salas", 303);
  const { error } = await supabase.from("rooms").update({ status: "closed" }).eq("id", roomId);
  return redirect(error ? `/salas/${roomId}?erro=close` : "/salas", 303);
};
