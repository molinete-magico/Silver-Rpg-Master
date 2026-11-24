import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const role = auth.user?.app_metadata.global_role;
  if (authError || !auth.user || !["admin", "master"].includes(String(role))) return new Response("Forbidden", { status: 403 });

  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const roomType = String(form.get("room_type") ?? "permanent");
  const discordUrl = String(form.get("discord_invite_url") ?? "").trim();

  if (!name || name.length > 80 || !["temporary", "permanent"].includes(roomType)) return redirect("/salas?erro=invalid", 303);
  if (discordUrl && !/^https:\/\/(discord\.gg|discord\.com\/invite)\/[A-Za-z0-9-]+$/.test(discordUrl)) return redirect("/salas?erro=discord", 303);

  const { data, error } = await supabase.from("rooms").insert({
    name, room_type: roomType, owner_id: auth.user.id, discord_invite_url: discordUrl || null,
  }).select("id").single();
  if (error || !data) return redirect("/salas?erro=create", 303);
  return redirect(`/salas/${data.id}`, 303);
};
