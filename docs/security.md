# Segurança e modelo de permissões

## Identidade e entrada

- A conta administrativa permanece uma conta Supabase Auth permanente, protegida por e-mail e senha.
- Participantes não criam contas com e-mail ou senha. Eles informam um token compartilhado e o servidor cria uma identidade anônima do Supabase Auth.
- Cada identidade anônima recebe um vínculo em `public.access_grants` para o token utilizado.
- Os tokens são gerados com 32 bytes aleatórios; somente o hash SHA-256 é armazenado. O código em texto puro aparece uma única vez na tela administrativa.
- Um token pode ser reutilizado por várias pessoas. Revogá-lo marca `revoked_at`; o middleware e as políticas RLS consultam a validade do vínculo, invalidando também sessões já abertas.
- Privilégios administrativos vêm exclusivamente de `auth.users.raw_app_meta_data` / JWT `app_metadata`, nunca de `user_metadata`.
- A função de resgate aceita somente identidades anônimas. A conta permanente do administrador continua separada desse fluxo.

## Tokens administrativos

- Somente `app_metadata.global_role = admin` pode emitir, listar e revogar tokens.
- As tabelas `access_tokens` e `access_grants` não são acessíveis diretamente pela Data API. A aplicação usa RPCs com wrappers `SECURITY INVOKER`.
- As operações privilegiadas ficam no schema privado `private`, com `SECURITY DEFINER`, `search_path` fixo, verificações explícitas e permissões de execução limitadas a `authenticated`.

## Sessões

- Qualquer participante com token válido pode ver e entrar em sessões abertas.
- Somente usuários com papel global `admin` ou `master` podem criar sessões. O criador é inserido automaticamente como Mestre daquela sessão.
- O Mestre pode encerrar a sessão e administrar seus recursos de sala.
- Convites individuais por sala foram desativados; o token global é a única porta de entrada.
- A autorização para entrar é validada no banco pela RPC `join_open_room`.

## Personagens e recursos

- Personagens são compartilhados globalmente entre todos os participantes com token válido, não apenas entre membros de uma sala.
- Todos os participantes autorizados podem criar, visualizar, renomear, editar e excluir personagens e barras de recursos.
- As políticas RLS consultam as relações e o vínculo de acesso no banco. A interface não é a fronteira de segurança.
- Atualizações de barras usam `updated_at` como verificação otimista; Realtime atualiza os demais clientes.

## Música e arquivos

- Faixas e playlists continuam usando o bucket privado e as políticas existentes por usuário/sala.
- O estado musical da sala continua sincronizado e controlado pelas permissões da sessão.

## Compartilhamento de tela

- O endpoint LiveKit emite tokens somente no servidor, após validar o acesso à sala e a autorização de publicação.
- São necessárias as variáveis privadas `LIVEKIT_URL`, `LIVEKIT_API_KEY` e `LIVEKIT_API_SECRET` no Vercel. Sem elas, o endpoint responde com indisponibilidade e não expõe segredos.

## Auditoria

- As 15 tabelas do schema `public` estão com RLS habilitado.
- Os RPCs públicos expostos usam `SECURITY INVOKER`; funções privilegiadas estão no schema `private`.
- O Supabase Security Advisor não reporta falhas de RLS nem RPCs públicas SECURITY DEFINER. Permanece um aviso de proteção contra senhas vazadas desabilitada na conta administrativa.
- O Performance Advisor aponta índices de chaves estrangeiras ausentes em tabelas preexistentes; não bloqueia o fluxo de acesso.
