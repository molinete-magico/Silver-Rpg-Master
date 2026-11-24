import type { APIRoute } from "astro";

export const POST: APIRoute = async () => {
  return new Response("Cadastro por conta desativado. Use um token compartilhado.", {
    status: 410,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
