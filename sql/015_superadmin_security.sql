-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Migration 015: Superadmin Role & Security Logging (Updated)
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Ajouter la valeur 'superadmin' à l'enum user_role
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'superadmin';

-- 2. Mettre à jour les fonctions de vérification RLS pour inclure le rôle superadmin
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() 
       and role in ('admin', 'superadmin') 
       and is_active = true
  );
$$;

create or replace function public.is_admin_or_vendeur()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid()
       and role in ('admin','vendeur','vendeur_proprietaire','superadmin')
       and is_active = true
  );
$$;

-- 3. Créer une fonction spécifique pour le superadmin
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() 
       and role = 'superadmin' 
       and is_active = true
  );
$$;

grant execute on function public.is_superadmin() to authenticated;

-- 4. Table pour le suivi du Rate Limiting et de la sécurité Superadmin
create table if not exists public.superadmin_security_log (
  id           uuid          primary key default gen_random_uuid(),
  ip_address   text          not null,
  action_type  text          not null, -- 'pow_request', 'pow_verify', 'db_backup', 'db_wipe'
  success      boolean       not null default true,
  created_at   timestamptz   not null default now()
);

-- Index pour accélérer la vérification du rate limit sur l'IP et le timestamp
create index if not exists idx_superadmin_security_ip_time 
  on public.superadmin_security_log (ip_address, created_at desc);

-- Activer la RLS
alter table public.superadmin_security_log enable row level security;

-- Droits RLS : Seul le superadmin (ou service_role) peut voir ces logs
drop policy if exists superadmin_security_log_select on public.superadmin_security_log;
create policy superadmin_security_log_select on public.superadmin_security_log
  for select to authenticated
  using (public.is_superadmin());

-- Autoriser l'insertion pour toute personne authentifiée (pour logger les tentatives)
drop policy if exists superadmin_security_log_insert on public.superadmin_security_log;
create policy superadmin_security_log_insert on public.superadmin_security_log
  for insert to authenticated
  with check (true);

-- 5. RPC pour réinitialiser les données opérationnelles en toute sécurité
create or replace function public.wipe_operational_data()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Vérifier le rôle de l'utilisateur qui appelle la fonction
  if not public.is_superadmin() then
    raise exception 'FORBIDDEN' using
      errcode = '42501',
      hint    = 'Only superadmins can wipe operational data.';
  end if;

  -- 1) Désactiver temporairement les triggers utilisateurs
  alter table public.bons_livraison disable trigger user;
  alter table public.commandes disable trigger user;

  -- 2) Tronquer les tables opérationnelles avec cascade
  truncate table public.driver_locations cascade;
  truncate table public.notifications cascade;
  truncate table public.creneaux_livraison cascade;
  truncate table public.lignes_bl cascade;
  truncate table public.bons_livraison cascade;
  truncate table public.commandes cascade;
  truncate table public.clients cascade;
  truncate table public.bl_status_history cascade;
  truncate table public.bl_attempt_log cascade;
  truncate table public.signatures_electroniques cascade;
  truncate table public.push_subscriptions cascade;

  -- 3) Réactiver les triggers
  alter table public.bons_livraison enable trigger user;
  alter table public.commandes enable trigger user;
end;
$$;

grant execute on function public.wipe_operational_data() to authenticated;
