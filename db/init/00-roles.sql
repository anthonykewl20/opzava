-- Local development bootstrap for the two-role database model.
-- These fixed passwords are LOCAL ONLY for fresh Docker Compose databases.
-- Shared/live environments must provision equivalent roles with managed secrets.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'opzava_owner') then
    create role opzava_owner
      login
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls
      password 'opzava_owner_local_only';
  else
    alter role opzava_owner
      login
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls
      password 'opzava_owner_local_only';
  end if;

  if not exists (select 1 from pg_roles where rolname = 'opzava_app') then
    create role opzava_app
      login
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls
      password 'opzava_app_local_only';
  else
    alter role opzava_app
      login
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      nobypassrls
      password 'opzava_app_local_only';
  end if;
end
$$;

grant connect, create, temporary on database opzava to opzava_owner;
grant connect on database opzava to opzava_app;

revoke create on schema public from public;
grant usage, create on schema public to opzava_owner;
grant usage on schema public to opzava_app;

create schema if not exists app authorization opzava_owner;
grant usage on schema app to opzava_app;

alter default privileges for role opzava_owner in schema public
  grant select, insert, update, delete on tables to opzava_app;
alter default privileges for role opzava_owner in schema public
  grant usage, select, update on sequences to opzava_app;
alter default privileges for role opzava_owner in schema app
  grant execute on functions to opzava_app;

alter role opzava_owner in database opzava set search_path = public, app;
alter role opzava_app in database opzava set search_path = public, app;
