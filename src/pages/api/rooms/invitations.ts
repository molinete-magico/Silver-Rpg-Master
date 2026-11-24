import type { APIRoute } from "astro";

export const POST: APIRoute = async () => {
  return new Response("Convites individuais de sessão foram substituídos pelo acesso compartilhado.", {
    status: 410,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
