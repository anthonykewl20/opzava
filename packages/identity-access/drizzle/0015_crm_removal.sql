-- Remove the Slice 3 CRM data layer.

set lock_timeout = '3s';
set statement_timeout = '30s';

drop policy if exists crm_accounts_tenant_isolation on public.crm_accounts;
drop policy if exists crm_accounts_tenant_context_required on public.crm_accounts;
drop policy if exists crm_accounts_owner_admin on public.crm_accounts;

drop policy if exists crm_contacts_tenant_isolation on public.crm_contacts;
drop policy if exists crm_contacts_tenant_context_required on public.crm_contacts;
drop policy if exists crm_contacts_owner_admin on public.crm_contacts;

drop policy if exists crm_pipelines_tenant_isolation on public.crm_pipelines;
drop policy if exists crm_pipelines_tenant_context_required on public.crm_pipelines;
drop policy if exists crm_pipelines_owner_admin on public.crm_pipelines;

drop policy if exists crm_pipeline_stages_tenant_isolation on public.crm_pipeline_stages;
drop policy if exists crm_pipeline_stages_tenant_context_required on public.crm_pipeline_stages;
drop policy if exists crm_pipeline_stages_owner_admin on public.crm_pipeline_stages;

drop policy if exists crm_deals_tenant_isolation on public.crm_deals;
drop policy if exists crm_deals_tenant_context_required on public.crm_deals;
drop policy if exists crm_deals_owner_admin on public.crm_deals;

drop policy if exists crm_tickets_tenant_isolation on public.crm_tickets;
drop policy if exists crm_tickets_tenant_context_required on public.crm_tickets;
drop policy if exists crm_tickets_owner_admin on public.crm_tickets;

drop policy if exists crm_activities_tenant_isolation on public.crm_activities;
drop policy if exists crm_activities_tenant_context_required on public.crm_activities;
drop policy if exists crm_activities_owner_admin on public.crm_activities;

drop table if exists public.crm_activities;
drop table if exists public.crm_tickets;
drop table if exists public.crm_deals;
drop table if exists public.crm_pipeline_stages;
drop table if exists public.crm_pipelines;
drop table if exists public.crm_contacts;
drop table if exists public.crm_accounts;

drop type if exists public.crm_activity_actor_kind;
drop type if exists public.crm_activity_kind;
drop type if exists public.crm_ticket_priority;
drop type if exists public.crm_ticket_status;
drop type if exists public.crm_deal_status;
drop type if exists public.crm_contact_lifecycle;
