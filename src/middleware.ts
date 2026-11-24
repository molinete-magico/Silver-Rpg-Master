import { defineMiddleware } from "astro:middleware";
import { createSupabaseServerClient } from "./lib/supabase/server";

const publicPaths = new Set(["/", "/entrar", "/api/auth/login", "/api/auth/redeem"]);

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = null;
  if (publicPaths.has(context.url.pathname)) return next();

  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return context.redirect("/entrar?motivo=configuracao");

  const supabase = createSupabaseServerClient(context.request, context.cookies);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return context.redirect("/entrar");

  if (data.user.app_metadata.global_role !== "admin") {
    const { data: allowed, error: accessError } = await supabase.rpc("has_valid_access");
    if (accessError || allowed !== true) {
      await supabase.auth.signOut();
      return context.redirect("/entrar?erro=revogado");
    }
  }

  context.locals.user = data.user;
  return next();
});
