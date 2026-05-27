-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — RLS Policies (schéma `public.*` unifié)
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Activation de la RLS sur chaque table
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.profiles                  enable row level security;
alter table public.clients                   enable row level security;
alter table public.commandes                 enable row level security;
alter table public.bons_livraison            enable row level security;
alter table public.lignes_bl                 enable row level security;
alter table public.creneaux_livraison        enable row level security;
alter table public.signatures_electroniques  enable row level security;
alter table public.driver_locations          enable row level security;
alter table public.notifications             enable row level security;
alter table public.push_subscriptions        enable row level security;
alter table public.bl_attempt_log            enable row level security;
alter table public.bl_status_history         enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. profiles
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin_or_vendeur());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated
  with check (public.is_admin() or id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using       (id = auth.uid() or public.is_admin())
  with check  (id = auth.uid() or public.is_admin());

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. clients
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated
  using (
    public.is_admin_or_vendeur()
    or exists (
      select 1 from public.bons_livraison bl
       where bl.client_id = clients.id and bl.livreur_id = auth.uid()
    )
  );

drop policy if exists clients_modify on public.clients;
create policy clients_modify on public.clients
  for all to authenticated
  using       (public.is_admin_or_vendeur())
  with check  (public.is_admin_or_vendeur());


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. commandes
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists commandes_select on public.commandes;
create policy commandes_select on public.commandes
  for select to authenticated
  using (
    public.is_admin_or_vendeur()
    or exists (
      select 1 from public.bons_livraison bl
       where bl.commande_id = commandes.id and bl.livreur_id = auth.uid()
    )
  );

drop policy if exists commandes_modify on public.commandes;
create policy commandes_modify on public.commandes
  for all to authenticated
  using       (public.is_admin_or_vendeur())
  with check  (public.is_admin_or_vendeur());


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. bons_livraison
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists bl_select on public.bons_livraison;
create policy bl_select on public.bons_livraison
  for select to authenticated
  using (
    livreur_id  = auth.uid()
    or vendeur_id = auth.uid()
    or public.is_admin_or_vendeur()
  );

drop policy if exists bl_insert on public.bons_livraison;
create policy bl_insert on public.bons_livraison
  for insert to authenticated
  with check (public.is_admin_or_vendeur());

-- Le livreur peut mettre à jour ses propres bons opérationnels (statut, etc.)
drop policy if exists bl_update_livreur on public.bons_livraison;
create policy bl_update_livreur on public.bons_livraison
  for update to authenticated
  using (
    livreur_id = auth.uid()
    and statut in ('assigne','confirme','release_demandee','en_livraison','en_route','livre','echec_T1','echec_T2')
  )
  with check (livreur_id = auth.uid());

-- L'admin ou vendeur peut mettre à jour n'importe quel champ
drop policy if exists bl_update_admin on public.bons_livraison;
create policy bl_update_admin on public.bons_livraison
  for update to authenticated
  using       (public.is_admin_or_vendeur())
  with check  (public.is_admin_or_vendeur());

drop policy if exists bl_delete on public.bons_livraison;
create policy bl_delete on public.bons_livraison
  for delete to authenticated
  using (public.is_admin());


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. lignes_bl
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists lignes_bl_select on public.lignes_bl;
create policy lignes_bl_select on public.lignes_bl
  for select to authenticated
  using (
    exists (
      select 1 from public.bons_livraison bl
       where bl.id = lignes_bl.bl_id
         and (bl.livreur_id = auth.uid() or bl.vendeur_id = auth.uid() or public.is_admin_or_vendeur())
    )
  );

drop policy if exists lignes_bl_modify on public.lignes_bl;
create policy lignes_bl_modify on public.lignes_bl
  for all to authenticated
  using       (public.is_admin_or_vendeur())
  with check  (public.is_admin_or_vendeur());


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. creneaux_livraison
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists creneaux_select on public.creneaux_livraison;
create policy creneaux_select on public.creneaux_livraison
  for select to authenticated
  using (livreur_id = auth.uid() or public.is_admin_or_vendeur());

drop policy if exists creneaux_modify on public.creneaux_livraison;
create policy creneaux_modify on public.creneaux_livraison
  for all to authenticated
  using       (livreur_id = auth.uid() or public.is_admin_or_vendeur())
  with check  (livreur_id = auth.uid() or public.is_admin_or_vendeur());


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. signatures_electroniques
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists sig_select_internal on public.signatures_electroniques;
create policy sig_select_internal on public.signatures_electroniques
  for select to authenticated
  using (
    public.is_admin_or_vendeur()
    or exists (
      select 1 from public.bons_livraison bl
       where bl.id = signatures_electroniques.bl_id and bl.livreur_id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. driver_locations
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists dl_select on public.driver_locations;
create policy dl_select on public.driver_locations
  for select to authenticated
  using (driver_id = auth.uid() or public.is_admin_or_vendeur());

drop policy if exists dl_insert on public.driver_locations;
create policy dl_insert on public.driver_locations
  for insert to authenticated
  with check (driver_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. notifications
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications
  for update to authenticated
  using       (user_id = auth.uid())
  with check  (user_id = auth.uid());

drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications
  for insert to authenticated
  with check (true);


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. push_subscriptions
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists push_modify on public.push_subscriptions;
create policy push_modify on public.push_subscriptions
  for all to authenticated
  using       (user_id = auth.uid())
  with check  (user_id = auth.uid());


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. bl_attempt_log
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists attempt_select on public.bl_attempt_log;
create policy attempt_select on public.bl_attempt_log
  for select to authenticated
  using (livreur_id = auth.uid() or public.is_admin_or_vendeur());

drop policy if exists attempt_insert on public.bl_attempt_log;
create policy attempt_insert on public.bl_attempt_log
  for insert to authenticated
  with check (livreur_id = auth.uid() or public.is_admin_or_vendeur());


-- ─────────────────────────────────────────────────────────────────────────────
-- 13. bl_status_history
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists history_select on public.bl_status_history;
create policy history_select on public.bl_status_history
  for select to authenticated
  using (
    public.is_admin_or_vendeur()
    or exists (
      select 1 from public.bons_livraison bl
       where bl.id = bl_status_history.bl_id and bl.livreur_id = auth.uid()
    )
  );
