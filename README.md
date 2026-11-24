# Silver RPG Master

Aplicação privada para apoiar sessões de RPG de mesa. Reúne sessões, personagens e barras de recursos compartilhados, trilha sonora sincronizada e compartilhamento de tela. A voz continua no Discord.

> Estado: primeira versão do acesso compartilhado implementada em branch de teste. O banco Supabase está configurado e o Preview Vercel foi gerado; a validação com participantes depende de habilitar Anonymous Sign-ins e configurar as credenciais privadas do LiveKit.

## Stack

- Astro SSR + React + TypeScript
- Supabase: PostgreSQL, Auth, RLS, Realtime e Storage
- Vercel: hospedagem e Preview
- LiveKit: compartilhamento de tela
- YouTube IFrame Player API: integração de mídia

## Desenvolvimento local

Requisitos: Node.js 22+ e npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Configure `PUBLIC_SUPABASE_URL` e `PUBLIC_SUPABASE_PUBLISHABLE_KEY` no arquivo `.env`. São valores publicáveis; nunca coloque chaves secretas em variáveis `PUBLIC_*`.

Verificações:

```bash
npm run check
npm run build
npm run preview
```

## Supabase

Projeto conectado: `guohjxrqjcdrcafbehbe` (PostgreSQL 17, região us-east-2).

As migrations versionadas em `supabase/migrations` incluem o esquema inicial e o novo sistema de tokens compartilhados. As duas migrations de acesso compartilhado já foram aplicadas ao projeto Supabase conectado.

### Habilitar acesso anônimo

No Dashboard do Supabase, abra **Authentication → Sign In / Providers → Anonymous Sign-Ins** e habilite a opção. O app usa identidades anônimas do Supabase Auth para que os participantes não precisem de e-mail ou senha. O token global continua sendo a autorização real de acesso.

### Modelo de acesso

1. O administrador entra com sua conta permanente e abre `/admin`.
2. Gera um token compartilhado e reutilizável; o código é exibido uma única vez.
3. Os participantes inserem o código em `/entrar`.
4. O servidor cria uma identidade anônima e vincula essa sessão ao hash do token.
5. Tokens revogados deixam de autorizar imediatamente as sessões vinculadas.
6. Todos os participantes autorizados veem e podem editar a biblioteca global de personagens.
7. Qualquer participante autorizado pode entrar em uma sessão aberta. Apenas o papel global `admin` ou `master` pode abrir sessões; o criador é Mestre daquela sessão.

Os tokens são armazenados somente como hashes SHA-256. A chave publishable é a única chave Supabase utilizada no navegador; nenhuma service-role key é necessária para o fluxo de jogadores.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `PUBLIC_SUPABASE_URL` | URL pública do projeto Supabase |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publishable do Supabase |
| `LIVEKIT_URL` | URL do servidor LiveKit |
| `LIVEKIT_API_KEY` | Chave LiveKit, somente servidor |
| `LIVEKIT_API_SECRET` | Segredo LiveKit, somente servidor |
| `APP_URL` | Origem pública, opcional |

As variáveis públicas do Supabase já estão configuradas no Vercel. As três variáveis LiveKit ainda precisam ser adicionadas para habilitar compartilhamento de tela.

## Vercel

- Projeto: `silver-rpg-master`
- Produção continua ligada à branch `main`.
- Preview de teste é criado a partir de `feat/shared-access-tokens`.
- A proteção SSO do Vercel foi desativada para permitir que convidados acessem o Preview; a aplicação protege as páginas e dados com tokens compartilhados.
- Não mesclar a branch de teste até validar a entrada, a revogação, as sessões e os personagens.

## Segurança

Consulte [docs/architecture.md](docs/architecture.md) e [docs/security.md](docs/security.md).

- Todas as 15 tabelas do schema `public` têm RLS habilitado.
- A autorização administrativa usa exclusivamente `app_metadata.global_role`.
- Tokens são reutilizáveis, revogáveis e armazenados como hashes.
- A validação ocorre no middleware e novamente nas políticas RLS.
- Operações privilegiadas ficam no schema privado `private`.
