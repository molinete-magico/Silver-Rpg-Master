# Arquitetura — Silver RPG Master

## Direção

Aplicação privada com Astro em modo SSR, React para módulos interativos e TypeScript. O deploy de aplicação será feito na Vercel. Supabase fornece PostgreSQL, Auth, RLS, Storage e Realtime. LiveKit será usado somente para compartilhamento de tela; voz permanece no Discord.

## Limites de confiança

- O navegador usa somente a chave publishable do Supabase.
- Segredos de Supabase e LiveKit ficam no ambiente server-side.
- A identidade é obtida com `auth.getUser()` no servidor, nunca confiando em dados de sessão fornecidos pelo cliente.
- RLS é a fronteira de autorização dos dados.
- Operações privilegiadas serão implementadas em endpoints server-side ou funções restritas.
- O código de convite será validado no servidor e consumido atomicamente.

## Domínios previstos

- Identidade: perfis, papel administrativo global e convites.
- Salas: salas permanentes/temporárias e membros.
- Personagens: personagens pertencentes a participantes.
- Recursos: barras configuráveis com autorização do proprietário ou mestre.
- Música: biblioteca, faixas, playlists e estado sincronizado por sala.
- Compartilhamento: solicitações e concessões temporárias de acesso LiveKit.

## Estado

O repositório começou vazio. O primeiro incremento estabelece a base Astro/React/TypeScript, o shell visual, o fluxo inicial de sessão Supabase e a proteção server-side de páginas privadas. O esquema definitivo e as migrations serão adicionados após validar o projeto Supabase que será usado pela aplicação.
