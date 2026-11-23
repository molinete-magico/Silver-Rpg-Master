import { defineMiddleware } from "astro:middleware";
import { createSupabaseServerClient } from "./lib/supabase/server";

const publicPaths = new Set(["/", "/entrar", "/convite", "/api/auth/login"]);

export const onRequest = defineMiddleware(async (context, next) => {
  context.locals.user = null;

  if (publicPaths.has(context.url.pathname)) {
    return next();
  }

  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return context.redirect("/entrar?motivo=configuracao");
  }

  const supabase = createSupabaseServerClient(context.request, context.cookies);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return context.redirect("/entrar");
  }

  context.locals.user = data.user;
  return next();
});
