-- Slice 3 per-workspace Project Management card numbers.
-- Card numbers are display-only; UUID task ids remain the stable references.

set lock_timeout = '3s';
set statement_timeout = '30s';

do $$
begin
  if to_regclass('public.tasks') is not null
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'card_number'
    )
  then
    lock table public.tasks in access exclusive mode;

    alter table public.tasks
      alter column card_number drop default;

    drop index if exists public.tasks_workspace_card_number_unique;

    with numbered as (
      select
        id,
        row_number() over (
          partition by workspace_id
          order by created_at asc, id asc
        )::bigint as card_number
      from public.tasks
    )
    update public.tasks as tasks
    set card_number = numbered.card_number
    from numbered
    where tasks.id = numbered.id
      and tasks.card_number is distinct from numbered.card_number;

    create unique index if not exists tasks_workspace_card_number_unique
      on public.tasks (workspace_id, card_number);
  end if;
end
$$;

drop sequence if exists public.tasks_card_number_seq;
