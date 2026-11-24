# Arquitetura — Silver RPG Master

## Direção

Aplicação privada com Astro SSR, React e TypeScript. A Vercel hospeda a aplicação. Supabase fornece PostgreSQL, Auth, RLS, Storage e Realtime. LiveKit é usado para compartilhamento de tela; a voz continua no Discord.

## Fluxo de acesso

1. O administrador entra com sua conta permanente.
2. Em `/admin`, gera um token global reutilizável e o compartilha com os participantes.
3. O participante insere o token em `/entrar`; o servidor cria uma identidade anônima no Supabase Auth e valida o hash do token por RPC.
4. O banco vincula a identidade anônima ao registro do token.
5. O middleware valida o vínculo em cada requisição protegida. As políticas RLS repetem a verificação no banco.
6. Ao revogar o token, todos os vínculos associados deixam de autorizar novas requisições, inclusive em sessões existentes.

## Limites de confiança

- O navegador usa somente a chave publishable do Supabase.
- Segredos LiveKit ficam exclusivamente no ambiente server-side.
- A identidade é obtida com `auth.getUser()` no servidor, nunca confiando em dados de sessão fornecidos pelo cliente.
- RLS é a fronteira final de autorização dos dados.
- O schema `private` contém as operações privilegiadas e não é exposto pela Data API.
- RPCs no schema público são wrappers `SECURITY INVOKER` e delegam apenas a funções privadas com verificações explícitas.

## Domínios

- Identidade: conta administrativa permanente, tokens globais e vínculos de sessão.
- Sessões: salas abertas, membros e permissões de Mestre.
- Personagens: biblioteca global de personagens e barras compartilhadas.
- Música: biblioteca, faixas, playlists e estado sincronizado por sessão.
- Compartilhamento: solicitações e concessões temporárias de acesso LiveKit.

## Ambientes

- Repositório: `molinete-magico/Silver-Rpg-Master`.
- Produção: branch `main`.
- Testes: branch `feat/shared-access-tokens` e Preview Vercel.
- O Preview usa as variáveis públicas do projeto Supabase já configuradas. A autenticação anônima precisa estar habilitada no painel do Supabase.
- O compartilhamento de tela exige as três variáveis privadas do LiveKit.
- A implementação ainda não foi mesclada na `main`; validar o Preview antes da liberação.
