-- Slice 3 thin CRM core data layer.
-- CRM rows are tenant-scoped Opzava domain records; provider/channel sender ids
-- intentionally stay out of these tables.

set lock_timeout = '3s';
set statement_timeout = '30s';

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'crm_contact_lifecycle'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.crm_contact_lifecycle as enum (
      'lead',
      'qualified',
      'customer',
      'former'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'crm_deal_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.crm_deal_status as enum (
      'open',
      'won',
      'lost'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'crm_ticket_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.crm_ticket_status as enum (
      'new',
      'triage',
      'open',
      'waiting_on_customer',
      'resolved',
      'closed'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'crm_ticket_priority'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.crm_ticket_priority as enum (
      'low',
      'normal',
      'high',
      'urgent'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'crm_activity_kind'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.crm_activity_kind as enum (
      'note',
      'call',
      'contact_created',
      'account_created',
      'deal_created',
      'deal_stage_changed',
      'deal_status_changed',
      'ticket_created',
      'ticket_status_changed'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'crm_activity_actor_kind'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.crm_activity_actor_kind as enum (
      'human',
      'assistant'
    );
  end if;
end
$$;

create table if not exists public.crm_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null,
  domain text,
  industry text,
  website text,
  description text not null default '',
  owner_user_id text,
  parent_account_id uuid,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_accounts_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint crm_accounts_name_nonempty_check check (char_length(btrim(name)) > 0),
  constraint crm_accounts_name_length_check check (char_length(name) <= 240),
  constraint crm_accounts_description_length_check check (char_length(description) <= 4000),
  constraint crm_accounts_idempotency_key_check check (
    idempotency_key is null
    or (
      char_length(btrim(idempotency_key)) > 0
      and char_length(btrim(idempotency_key)) <= 160
    )
  )
);

create unique index if not exists crm_accounts_id_organization_id_unique
  on public.crm_accounts (id, organization_id);

create unique index if not exists crm_accounts_organization_idempotency_key_unique
  on public.crm_accounts (organization_id, idempotency_key);

create index if not exists crm_accounts_organization_workspace_name_idx
  on public.crm_accounts (organization_id, workspace_id, name);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_accounts_parent_account_organization_fk'
      and conrelid = 'public.crm_accounts'::regclass
  ) then
    alter table public.crm_accounts
      add constraint crm_accounts_parent_account_organization_fk
      foreign key (parent_account_id, organization_id)
      references public.crm_accounts (id, organization_id);
  end if;
end
$$;

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  display_name text not null,
  email text,
  phone text,
  title text,
  lifecycle_stage public.crm_contact_lifecycle not null default 'lead',
  account_id uuid,
  owner_user_id text,
  notes text not null default '',
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_contacts_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint crm_contacts_display_name_nonempty_check
    check (char_length(btrim(display_name)) > 0),
  constraint crm_contacts_display_name_length_check check (char_length(display_name) <= 240),
  constraint crm_contacts_email_length_check check (email is null or char_length(email) <= 320),
  constraint crm_contacts_phone_length_check check (phone is null or char_length(phone) <= 80),
  constraint crm_contacts_notes_length_check check (char_length(notes) <= 4000),
  constraint crm_contacts_idempotency_key_check check (
    idempotency_key is null
    or (
      char_length(btrim(idempotency_key)) > 0
      and char_length(btrim(idempotency_key)) <= 160
    )
  )
);

create unique index if not exists crm_contacts_id_organization_id_unique
  on public.crm_contacts (id, organization_id);

create unique index if not exists crm_contacts_organization_idempotency_key_unique
  on public.crm_contacts (organization_id, idempotency_key);

create index if not exists crm_contacts_organization_workspace_name_idx
  on public.crm_contacts (organization_id, workspace_id, display_name);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_contacts_account_organization_fk'
      and conrelid = 'public.crm_contacts'::regclass
  ) then
    alter table public.crm_contacts
      add constraint crm_contacts_account_organization_fk
      foreign key (account_id, organization_id)
      references public.crm_accounts (id, organization_id);
  end if;
end
$$;

create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  key text not null default 'default',
  version integer not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_pipelines_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint crm_pipelines_key_nonempty_check check (char_length(btrim(key)) > 0),
  constraint crm_pipelines_key_length_check check (char_length(key) <= 120),
  constraint crm_pipelines_version_positive_check check (version > 0),
  constraint crm_pipelines_name_nonempty_check check (char_length(btrim(name)) > 0),
  constraint crm_pipelines_name_length_check check (char_length(name) <= 240)
);

create unique index if not exists crm_pipelines_id_organization_id_unique
  on public.crm_pipelines (id, organization_id);

create unique index if not exists crm_pipelines_workspace_key_version_unique
  on public.crm_pipelines (workspace_id, key, version);

create table if not exists public.crm_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  name text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_pipeline_stages_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint crm_pipeline_stages_name_nonempty_check check (char_length(btrim(name)) > 0),
  constraint crm_pipeline_stages_name_length_check check (char_length(name) <= 240),
  constraint crm_pipeline_stages_position_nonnegative_check check (position >= 0)
);

create unique index if not exists crm_pipeline_stages_id_organization_id_unique
  on public.crm_pipeline_stages (id, organization_id);

create unique index if not exists crm_pipeline_stages_pipeline_position_unique
  on public.crm_pipeline_stages (pipeline_id, position);

create index if not exists crm_pipeline_stages_organization_pipeline_position_idx
  on public.crm_pipeline_stages (organization_id, pipeline_id, position);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_pipeline_stages_pipeline_organization_fk'
      and conrelid = 'public.crm_pipeline_stages'::regclass
  ) then
    alter table public.crm_pipeline_stages
      add constraint crm_pipeline_stages_pipeline_organization_fk
      foreign key (pipeline_id, organization_id)
      references public.crm_pipelines (id, organization_id);
  end if;
end
$$;

create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  title text not null,
  account_id uuid not null,
  primary_contact_id uuid,
  pipeline_id uuid not null,
  stage_id uuid not null,
  status public.crm_deal_status not null default 'open',
  value_cents bigint,
  currency text not null default 'USD',
  owner_user_id text,
  expected_close_date timestamptz,
  closed_at timestamptz,
  close_reason text,
  position integer not null default 0,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_deals_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint crm_deals_title_nonempty_check check (char_length(btrim(title)) > 0),
  constraint crm_deals_title_length_check check (char_length(title) <= 240),
  constraint crm_deals_value_nonnegative_check check (value_cents is null or value_cents >= 0),
  constraint crm_deals_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint crm_deals_position_nonnegative_check check (position >= 0),
  constraint crm_deals_close_reason_length_check
    check (close_reason is null or char_length(close_reason) <= 1000),
  constraint crm_deals_idempotency_key_check check (
    idempotency_key is null
    or (
      char_length(btrim(idempotency_key)) > 0
      and char_length(btrim(idempotency_key)) <= 160
    )
  )
);

create unique index if not exists crm_deals_id_organization_id_unique
  on public.crm_deals (id, organization_id);

create unique index if not exists crm_deals_organization_idempotency_key_unique
  on public.crm_deals (organization_id, idempotency_key);

create index if not exists crm_deals_organization_workspace_pipeline_stage_position_idx
  on public.crm_deals (organization_id, workspace_id, pipeline_id, stage_id, position);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_deals_account_organization_fk'
      and conrelid = 'public.crm_deals'::regclass
  ) then
    alter table public.crm_deals
      add constraint crm_deals_account_organization_fk
      foreign key (account_id, organization_id)
      references public.crm_accounts (id, organization_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_deals_primary_contact_organization_fk'
      and conrelid = 'public.crm_deals'::regclass
  ) then
    alter table public.crm_deals
      add constraint crm_deals_primary_contact_organization_fk
      foreign key (primary_contact_id, organization_id)
      references public.crm_contacts (id, organization_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_deals_pipeline_organization_fk'
      and conrelid = 'public.crm_deals'::regclass
  ) then
    alter table public.crm_deals
      add constraint crm_deals_pipeline_organization_fk
      foreign key (pipeline_id, organization_id)
      references public.crm_pipelines (id, organization_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_deals_stage_organization_fk'
      and conrelid = 'public.crm_deals'::regclass
  ) then
    alter table public.crm_deals
      add constraint crm_deals_stage_organization_fk
      foreign key (stage_id, organization_id)
      references public.crm_pipeline_stages (id, organization_id);
  end if;
end
$$;

create table if not exists public.crm_tickets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  subject text not null,
  body text not null default '',
  contact_id uuid not null,
  account_id uuid,
  status public.crm_ticket_status not null default 'new',
  priority public.crm_ticket_priority not null default 'normal',
  queue text not null default 'support',
  assignee_user_id text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_tickets_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint crm_tickets_subject_nonempty_check check (char_length(btrim(subject)) > 0),
  constraint crm_tickets_subject_length_check check (char_length(subject) <= 240),
  constraint crm_tickets_body_length_check check (char_length(body) <= 8000),
  constraint crm_tickets_queue_nonempty_check check (char_length(btrim(queue)) > 0),
  constraint crm_tickets_queue_length_check check (char_length(queue) <= 120),
  constraint crm_tickets_idempotency_key_check check (
    idempotency_key is null
    or (
      char_length(btrim(idempotency_key)) > 0
      and char_length(btrim(idempotency_key)) <= 160
    )
  )
);

create unique index if not exists crm_tickets_id_organization_id_unique
  on public.crm_tickets (id, organization_id);

create unique index if not exists crm_tickets_organization_idempotency_key_unique
  on public.crm_tickets (organization_id, idempotency_key);

create index if not exists crm_tickets_organization_workspace_status_priority_idx
  on public.crm_tickets (organization_id, workspace_id, status, priority);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_tickets_contact_organization_fk'
      and conrelid = 'public.crm_tickets'::regclass
  ) then
    alter table public.crm_tickets
      add constraint crm_tickets_contact_organization_fk
      foreign key (contact_id, organization_id)
      references public.crm_contacts (id, organization_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_tickets_account_organization_fk'
      and conrelid = 'public.crm_tickets'::regclass
  ) then
    alter table public.crm_tickets
      add constraint crm_tickets_account_organization_fk
      foreign key (account_id, organization_id)
      references public.crm_accounts (id, organization_id);
  end if;
end
$$;

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  kind public.crm_activity_kind not null,
  body text not null default '',
  actor_kind public.crm_activity_actor_kind not null default 'human',
  actor_user_id text,
  contact_id uuid,
  account_id uuid,
  deal_id uuid,
  ticket_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint crm_activities_workspace_organization_fk
    foreign key (workspace_id, organization_id)
    references public.workspaces (id, organization_id)
    on delete restrict,
  constraint crm_activities_body_length_check check (char_length(body) <= 4000)
);

create unique index if not exists crm_activities_id_organization_id_unique
  on public.crm_activities (id, organization_id);

create index if not exists crm_activities_organization_contact_occurred_idx
  on public.crm_activities (organization_id, contact_id, occurred_at);

create index if not exists crm_activities_organization_deal_occurred_idx
  on public.crm_activities (organization_id, deal_id, occurred_at);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_activities_subject_ref_check'
      and conrelid = 'public.crm_activities'::regclass
  ) then
    alter table public.crm_activities
      add constraint crm_activities_subject_ref_check
      check (
        contact_id is not null
        or account_id is not null
        or deal_id is not null
        or ticket_id is not null
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_activities_contact_organization_fk'
      and conrelid = 'public.crm_activities'::regclass
  ) then
    alter table public.crm_activities
      add constraint crm_activities_contact_organization_fk
      foreign key (contact_id, organization_id)
      references public.crm_contacts (id, organization_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_activities_account_organization_fk'
      and conrelid = 'public.crm_activities'::regclass
  ) then
    alter table public.crm_activities
      add constraint crm_activities_account_organization_fk
      foreign key (account_id, organization_id)
      references public.crm_accounts (id, organization_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_activities_deal_organization_fk'
      and conrelid = 'public.crm_activities'::regclass
  ) then
    alter table public.crm_activities
      add constraint crm_activities_deal_organization_fk
      foreign key (deal_id, organization_id)
      references public.crm_deals (id, organization_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'crm_activities_ticket_organization_fk'
      and conrelid = 'public.crm_activities'::regclass
  ) then
    alter table public.crm_activities
      add constraint crm_activities_ticket_organization_fk
      foreign key (ticket_id, organization_id)
      references public.crm_tickets (id, organization_id);
  end if;
end
$$;

alter table public.crm_accounts owner to opzava_owner;
alter table public.crm_contacts owner to opzava_owner;
alter table public.crm_pipelines owner to opzava_owner;
alter table public.crm_pipeline_stages owner to opzava_owner;
alter table public.crm_deals owner to opzava_owner;
alter table public.crm_tickets owner to opzava_owner;
alter table public.crm_activities owner to opzava_owner;

grant select, insert, update, delete on table
  public.crm_accounts,
  public.crm_contacts,
  public.crm_pipelines,
  public.crm_pipeline_stages,
  public.crm_deals,
  public.crm_tickets,
  public.crm_activities
to opzava_app;

alter table public.crm_accounts enable row level security;
alter table public.crm_accounts force row level security;

drop policy if exists crm_accounts_tenant_isolation on public.crm_accounts;
create policy crm_accounts_tenant_isolation on public.crm_accounts
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists crm_accounts_tenant_context_required on public.crm_accounts;
create policy crm_accounts_tenant_context_required on public.crm_accounts
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists crm_accounts_owner_admin on public.crm_accounts;
create policy crm_accounts_owner_admin on public.crm_accounts
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.crm_contacts enable row level security;
alter table public.crm_contacts force row level security;

drop policy if exists crm_contacts_tenant_isolation on public.crm_contacts;
create policy crm_contacts_tenant_isolation on public.crm_contacts
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists crm_contacts_tenant_context_required on public.crm_contacts;
create policy crm_contacts_tenant_context_required on public.crm_contacts
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists crm_contacts_owner_admin on public.crm_contacts;
create policy crm_contacts_owner_admin on public.crm_contacts
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.crm_pipelines enable row level security;
alter table public.crm_pipelines force row level security;

drop policy if exists crm_pipelines_tenant_isolation on public.crm_pipelines;
create policy crm_pipelines_tenant_isolation on public.crm_pipelines
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists crm_pipelines_tenant_context_required on public.crm_pipelines;
create policy crm_pipelines_tenant_context_required on public.crm_pipelines
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists crm_pipelines_owner_admin on public.crm_pipelines;
create policy crm_pipelines_owner_admin on public.crm_pipelines
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.crm_pipeline_stages enable row level security;
alter table public.crm_pipeline_stages force row level security;

drop policy if exists crm_pipeline_stages_tenant_isolation on public.crm_pipeline_stages;
create policy crm_pipeline_stages_tenant_isolation on public.crm_pipeline_stages
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists crm_pipeline_stages_tenant_context_required on public.crm_pipeline_stages;
create policy crm_pipeline_stages_tenant_context_required on public.crm_pipeline_stages
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists crm_pipeline_stages_owner_admin on public.crm_pipeline_stages;
create policy crm_pipeline_stages_owner_admin on public.crm_pipeline_stages
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.crm_deals enable row level security;
alter table public.crm_deals force row level security;

drop policy if exists crm_deals_tenant_isolation on public.crm_deals;
create policy crm_deals_tenant_isolation on public.crm_deals
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists crm_deals_tenant_context_required on public.crm_deals;
create policy crm_deals_tenant_context_required on public.crm_deals
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists crm_deals_owner_admin on public.crm_deals;
create policy crm_deals_owner_admin on public.crm_deals
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.crm_tickets enable row level security;
alter table public.crm_tickets force row level security;

drop policy if exists crm_tickets_tenant_isolation on public.crm_tickets;
create policy crm_tickets_tenant_isolation on public.crm_tickets
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists crm_tickets_tenant_context_required on public.crm_tickets;
create policy crm_tickets_tenant_context_required on public.crm_tickets
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists crm_tickets_owner_admin on public.crm_tickets;
create policy crm_tickets_owner_admin on public.crm_tickets
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);

alter table public.crm_activities enable row level security;
alter table public.crm_activities force row level security;

drop policy if exists crm_activities_tenant_isolation on public.crm_activities;
create policy crm_activities_tenant_isolation on public.crm_activities
  as permissive
  for all
  to opzava_app
  using (organization_id = app.current_org_id())
  with check (organization_id = app.current_org_id());

drop policy if exists crm_activities_tenant_context_required on public.crm_activities;
create policy crm_activities_tenant_context_required on public.crm_activities
  as restrictive
  for all
  to opzava_app
  using (app.current_org_id() is not null)
  with check (app.current_org_id() is not null);

drop policy if exists crm_activities_owner_admin on public.crm_activities;
create policy crm_activities_owner_admin on public.crm_activities
  as permissive
  for all
  to opzava_owner
  using (true)
  with check (true);
