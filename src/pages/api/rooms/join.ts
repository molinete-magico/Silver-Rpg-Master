import { createHash } from "node:crypto";
import type { APIRoute } from "astro";
import { createSupabaseServerClient } from "../../../lib/supabase/server";

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = createSupabaseServerClient(request, cookies);
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) return redirect("/entrar", 303);

  const form = await request.formData();
  const code = String(form.get("code") ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(code)) return redirect("/salas?erro=invite", 303);

  const codeHash = createHash("sha256").update(code, "utf8").digest("hex");
  const { data, error } = await supabase.rpc("join_room_with_invite", { p_code_hash: codeHash });
  if (error || typeof data !== "string") return redirect("/salas?erro=invite", 303);
  return redirect(`/salas/${data}`, 303);
};
