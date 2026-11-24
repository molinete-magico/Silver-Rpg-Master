# Segurança e modelo de permissões

## Identidade

- Supabase Auth autentica usuários.
- O cadastro exige um convite. O trigger `private.handle_new_user` rejeita qualquer criação de usuário sem um hash de convite válido.
- O hash é calculado no servidor com SHA-256; o banco consome o convite atomicamente.
- Privilégios globais vêm exclusivamente de `auth.users.raw_app_meta_data` / JWT `app_metadata`, nunca de `user_metadata`.
- O primeiro administrador é provisionado por convite de bootstrap de uso único; convites emitidos pela interface administrativa não podem conceder privilégios globais.

## Salas

- Criador é inserido automaticamente em `room_members` como `gm`.
- Participantes entram via RPC de convite, que valida validade, uso e estado da sala.
- O wrapper RPC público é `SECURITY INVOKER`; a operação atômica privilegiada fica em `private.join_room_with_invite`, fora do schema exposto.
- O mestre pode administrar membros, sala, música e solicitações de compartilhamento.
- O participante pode sair da sala e gerenciar apenas seus próprios personagens e recursos.

## Personagens e recursos

- Todos os membros veem os personagens vinculados à sala e suas barras.
- O dono do personagem e o mestre da sala podem inserir, alterar, renomear e excluir barras.
- As políticas RLS consultam as relações no banco. A interface não é a fronteira de segurança.
- Atualizações usam `updated_at` como verificação otimista para detectar conflitos; Realtime atualiza os demais clientes.
- Um trigger preenche `updated_by` com `auth.uid()`.

## Música e arquivos

- Faixas e playlists pertencem a um usuário.
- O estado musical é controlado pelo mestre.
- O bucket `music` é privado. Uploads são organizados por UUID do proprietário; leitura em sala depende de uma faixa associada ao estado musical/playlist da sala.

## Compartilhamento de tela

- A tabela de solicitações está protegida por RLS.
- Tokens LiveKit devem ser emitidos por endpoint server-side depois de validar participação e aprovação. Essa etapa ainda não está implementada.

## Auditoria

Após as migrations iniciais, o Supabase Security Advisor não reportou lints. O RPC público de entrada foi ajustado para usar wrapper invoker e helper definer em schema privado; a verificação subsequente retornou lista vazia.
