# Silver RPG Master

Aplicação privada para apoiar sessões de RPG de mesa. Reúne o escudo do mestre, recursos dos personagens, trilha sonora sincronizada e compartilhamento de tela. A voz continua no Discord.

> Estado: implementação ativa. O banco inicial está criado, mas autenticação, convites e recursos ainda precisam de validação com uma conta real antes de considerar a aplicação pronta para sessões.

## Stack

- Astro SSR + React + TypeScript
- Supabase: PostgreSQL, Auth, RLS, Realtime e Storage
- Vercel: hospedagem e previews
- LiveKit: compartilhamento de tela (integração pendente)
- YouTube IFrame Player API: incorporação de áudio/vídeo (integração pendente)

## Desenvolvimento local

Requisitos: Node.js 22+ e npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Configure `PUBLIC_SUPABASE_URL` e `PUBLIC_SUPABASE_PUBLISHABLE_KEY` no arquivo `.env`. São valores publicáveis; não coloque chaves secretas em variáveis `PUBLIC_*`.

Verificações:

```bash
npm run check
npm run build
npm run preview
```

## Supabase

Projeto associado: `guohjxrqjcdrcafbehbe` (PostgreSQL 17, região us-east-2).

1. Instale a Supabase CLI.
2. Execute `supabase login`.
3. Execute `supabase link --project-ref guohjxrqjcdrcafbehbe`.
4. Confira `supabase migration list`.
5. Para um ambiente novo, aplique as migrations com `supabase db push`.

As migrations versionadas em `supabase/migrations` correspondem às quatro migrations já aplicadas no projeto remoto.

### Primeiro administrador

O projeto não possui usuários ainda. A primeira conta global deve ser criada por um convite de bootstrap de uso único:

1. Gere localmente um segredo hexadecimal de 64 caracteres, por exemplo com `openssl rand -hex 32`.
2. No SQL Editor do Supabase, insira somente o hash do segredo:

```sql
insert into public.invitations (code_hash, grant_global_admin, max_uses)
values (
  encode(extensions.digest(convert_to('COLE_AQUI_O_CODIGO_HEXADECIMAL', 'UTF8'), 'sha256'), 'hex'),
  true,
  1
);
```

3. Acesse `/convite` na aplicação e faça o cadastro com esse código.
4. O trigger valida e consome o convite atomicamente, cria o perfil e atribui `global_role=admin` em `app_metadata`.
5. Depois de entrar, use `/admin` para emitir convites comuns. A interface nunca exibe o hash armazenado.

Não compartilhe o código de bootstrap. Ele só pode ser usado uma vez.

## Variáveis de ambiente

| Variável | Uso |
| --- | --- |
| `PUBLIC_SUPABASE_URL` | URL pública do projeto Supabase |
| `PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave publishable do Supabase |
| `SUPABASE_SECRET_KEY` | Reservada para operações server-side privilegiadas; não usada pelo cliente |
| `LIVEKIT_URL` | URL do servidor LiveKit |
| `LIVEKIT_API_KEY` | Chave LiveKit, somente servidor |
| `LIVEKIT_API_SECRET` | Segredo LiveKit, somente servidor |
| `APP_URL` | Origem pública da aplicação |

## Vercel

O projeto ainda precisa ser criado/conectado à equipe Vercel autorizada. Configure as variáveis acima no ambiente apropriado e defina a raiz do projeto como a raiz do repositório. O deploy de produção deve aguardar validação do preview.

## Arquitetura e segurança

- Consulte [docs/architecture.md](docs/architecture.md) e [docs/security.md](docs/security.md).
- Todas as tabelas do schema `public` têm RLS habilitado.
- A autorização global usa somente `app_metadata.global_role`; `user_metadata` não é usado para privilégios.
- Convites armazenam hashes SHA-256 e são consumidos com atualização atômica.
- A chave publishable pode estar no navegador; chaves secretas não.
- A pasta de músicas usa bucket privado e políticas de acesso por usuário/sala.

## Estado atual

- [x] Base Astro/React/TypeScript e CI
- [x] Esquema inicial Supabase e RLS
- [x] Gate de cadastro por convite no trigger de Auth
- [x] Salas, membros, personagens e barras no banco
- [x] Realtime habilitado para recursos e estado da sala
- [x] Bucket privado para áudio
- [x] Telas e endpoints iniciais de cadastro, salas e barras
- [ ] Bootstrap do primeiro administrador
- [ ] Teste de autenticação com conta real
- [ ] Player musical completo
- [ ] Compartilhamento LiveKit
- [ ] Preview Vercel e validação E2E
