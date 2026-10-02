-- Novo RPG: esquema do banco no Supabase.
-- Cole tudo no SQL Editor do Supabase e clique em Run. É seguro rodar mais de uma vez.
--
-- Modelo de acesso (igual ao do Point): sem login, qualquer pessoa com o link do site
-- pode ler, criar, editar, mover, votar e comentar.
-- Salvaguardas que ficam no próprio banco:
--   * ninguém consegue APAGAR itens ou comentários de vez (só "excluir" = esconder);
--   * o autor original e a data de criação não podem ser alterados;
--   * toda criação/edição/movimentação/exclusão é registrada em rpg_history,
--     então dá para desfazer estragos;
--   * limites de tamanho e valores permitidos validados aqui, não só no site.

-- ---------------------------------------------------------------- tabelas

create table if not exists public.rpg_items (
  id          uuid primary key default gen_random_uuid(),
  stage       text not null default 'ideia'
              check (stage in ('ideia', 'pendente', 'andamento', 'consolidado', 'arquivada')),
  title       text not null check (char_length(btrim(title)) between 1 and 140),
  body        text not null default '' check (char_length(body) <= 6000),
  category    text check (category is null or category in ('mecanica', 'mundo', 'narrativa', 'arte', 'outro')),
  author      text not null check (char_length(btrim(author)) between 1 and 40),
  last_editor text check (last_editor is null or char_length(btrim(last_editor)) between 1 and 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index if not exists rpg_items_stage_idx
  on public.rpg_items (stage) where deleted_at is null;

create table if not exists public.rpg_comments (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.rpg_items (id) on delete cascade,
  author     text not null check (char_length(btrim(author)) between 1 and 40),
  body       text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists rpg_comments_item_idx
  on public.rpg_comments (item_id, created_at);

create table if not exists public.rpg_votes (
  item_id    uuid not null references public.rpg_items (id) on delete cascade,
  voter_id   text not null check (char_length(voter_id) between 8 and 64),
  voter_name text check (voter_name is null or char_length(voter_name) <= 40),
  created_at timestamptz not null default now(),
  primary key (item_id, voter_id)
);

create table if not exists public.rpg_history (
  id         bigint generated always as identity primary key,
  item_id    uuid not null,
  action     text not null,
  actor      text,
  old_row    jsonb,
  new_row    jsonb,
  created_at timestamptz not null default now()
);

create index if not exists rpg_history_item_idx
  on public.rpg_history (item_id, created_at desc);

-- ---------------------------------------------------------------- gatilhos

-- Antes de editar: trava o que não pode mudar e carimba a data.
create or replace function public.rpg_items_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.id         := old.id;
  new.created_at := old.created_at;
  new.author     := old.author;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists rpg_items_before_update on public.rpg_items;
create trigger rpg_items_before_update
  before update on public.rpg_items
  for each row execute function public.rpg_items_before_update();

-- Depois de criar/editar: guarda no histórico (roda com permissão do dono,
-- porque o acesso público não pode escrever em rpg_history diretamente).
create or replace function public.rpg_items_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  act text;
begin
  if tg_op = 'INSERT' then
    insert into public.rpg_history (item_id, action, actor, old_row, new_row)
    values (new.id, 'criou', new.author, null, to_jsonb(new));
  else
    if old.deleted_at is null and new.deleted_at is not null then
      act := 'excluiu';
    elsif old.stage is distinct from new.stage then
      act := 'moveu';
    else
      act := 'editou';
    end if;
    insert into public.rpg_history (item_id, action, actor, old_row, new_row)
    values (new.id, act, new.last_editor, to_jsonb(old), to_jsonb(new));
  end if;
  return null;
end;
$$;

drop trigger if exists rpg_items_audit on public.rpg_items;
create trigger rpg_items_audit
  after insert or update on public.rpg_items
  for each row execute function public.rpg_items_audit();

-- ---------------------------------------------------------------- permissões

alter table public.rpg_items    enable row level security;
alter table public.rpg_comments enable row level security;
alter table public.rpg_votes    enable row level security;
alter table public.rpg_history  enable row level security;

-- Começa sem nada e libera só o necessário (note: sem DELETE em itens/comentários).
revoke all on public.rpg_items, public.rpg_comments, public.rpg_votes, public.rpg_history
  from anon, authenticated;
revoke execute on function public.rpg_items_audit() from public, anon, authenticated;

grant select, insert, update on public.rpg_items    to anon, authenticated;
grant select, insert         on public.rpg_comments to anon, authenticated;
grant select, insert, delete on public.rpg_votes    to anon, authenticated;
grant select                 on public.rpg_history  to anon, authenticated;

-- rpg_items
drop policy if exists rpg_items_select on public.rpg_items;
create policy rpg_items_select on public.rpg_items
  for select to anon, authenticated using (true);

drop policy if exists rpg_items_insert on public.rpg_items;
create policy rpg_items_insert on public.rpg_items
  for insert to anon, authenticated with check (deleted_at is null);

drop policy if exists rpg_items_update on public.rpg_items;
create policy rpg_items_update on public.rpg_items
  for update to anon, authenticated using (true) with check (true);

-- rpg_comments
drop policy if exists rpg_comments_select on public.rpg_comments;
create policy rpg_comments_select on public.rpg_comments
  for select to anon, authenticated using (true);

drop policy if exists rpg_comments_insert on public.rpg_comments;
create policy rpg_comments_insert on public.rpg_comments
  for insert to anon, authenticated with check (true);

-- rpg_votes (apagar voto = desfazer o próprio 👍)
drop policy if exists rpg_votes_select on public.rpg_votes;
create policy rpg_votes_select on public.rpg_votes
  for select to anon, authenticated using (true);

drop policy if exists rpg_votes_insert on public.rpg_votes;
create policy rpg_votes_insert on public.rpg_votes
  for insert to anon, authenticated with check (true);

drop policy if exists rpg_votes_delete on public.rpg_votes;
create policy rpg_votes_delete on public.rpg_votes
  for delete to anon, authenticated using (true);

-- rpg_history (só leitura)
drop policy if exists rpg_history_select on public.rpg_history;
create policy rpg_history_select on public.rpg_history
  for select to anon, authenticated using (true);
