-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Triggers, Helpers & Views (schéma `public.*` unifié)
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Helper set_updated_at
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Attacher les triggers de mise à jour updated_at
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_profiles_updated_at' and tgrelid = 'public.profiles'::regclass) then
    create trigger trg_profiles_updated_at
      before update on public.profiles
      for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_clients_updated_at' and tgrelid = 'public.clients'::regclass) then
    create trigger trg_clients_updated_at
      before update on public.clients
      for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_commandes_updated_at' and tgrelid = 'public.commandes'::regclass) then
    create trigger trg_commandes_updated_at
      before update on public.commandes
      for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_bl_updated_at' and tgrelid = 'public.bons_livraison'::regclass) then
    create trigger trg_bl_updated_at
      before update on public.bons_livraison
      for each row execute function public.set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_creneaux_updated_at' and tgrelid = 'public.creneaux_livraison'::regclass) then
    create trigger trg_creneaux_updated_at
      before update on public.creneaux_livraison
      for each row execute function public.set_updated_at();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Fonctions helpers RLS (sécurisées pour contourner la récursion RLS)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

comment on function public.current_user_role() is
  'Retourne le rôle de l''utilisateur authentifié, ou NULL si anonyme. SECURITY DEFINER évite la récursion RLS.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'admin' and is_active = true
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
       and role in ('admin','vendeur','vendeur_proprietaire')
       and is_active = true
  );
$$;

create or replace function public.is_livreur()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
     where id = auth.uid() and role = 'livreur' and is_active = true
  );
$$;

grant execute on function
  public.current_user_role(),
  public.is_admin(),
  public.is_admin_or_vendeur(),
  public.is_livreur()
to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. generate_numero_bl — Génération automatique DECO-BL-YYMMDD-XXXX
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.generate_numero_bl()
returns trigger
language plpgsql
as $$
declare
  v_prefix text;
  v_suffix int;
begin
  if new.numero_bl is null or new.numero_bl = '' then
    v_prefix := 'DECO-BL-' || to_char(now(), 'YYMMDD') || '-';
    select coalesce(max(cast(split_part(numero_bl, '-', 4) as int)), 0) + 1
      into v_suffix
      from public.bons_livraison
     where numero_bl like v_prefix || '%';
    new.numero_bl := v_prefix || lpad(v_suffix::text, 4, '0');
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_auto_numero_bl' and tgrelid = 'public.bons_livraison'::regclass) then
    create trigger trg_auto_numero_bl
      before insert on public.bons_livraison
      for each row execute function public.generate_numero_bl();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. calculate_frais_relivraison — 5% de surcoût sur relivraison (RG-242b)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.calculate_frais_relivraison()
returns trigger
language plpgsql
as $$
begin
  if new.nb_tentatives >= 1 and new.admin_waiver = false then
    new.montant_frais_relivraison := round(new.montant_total_ttc * 0.05, 2);
  else
    new.montant_frais_relivraison := 0;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_frais_relivraison' and tgrelid = 'public.bons_livraison'::regclass) then
    create trigger trg_frais_relivraison
      before insert or update of nb_tentatives, admin_waiver, montant_total_ttc
      on public.bons_livraison
      for each row execute function public.calculate_frais_relivraison();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. log_bl_status_change — Remplit l'historique bl_status_history
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.log_bl_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.statut is distinct from new.statut then
    insert into public.bl_status_history (bl_id, ancien_statut, nouveau_statut, triggered_by, trigger_source)
    values (
      new.id, old.statut, new.statut, auth.uid(),
      case when auth.uid() is not null then 'user' else 'system' end
    );
  elsif tg_op = 'INSERT' then
    insert into public.bl_status_history (bl_id, ancien_statut, nouveau_statut, triggered_by, trigger_source)
    values (new.id, null, new.statut, auth.uid(), 'creation');
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_log_bl_status_change' and tgrelid = 'public.bons_livraison'::regclass) then
    create trigger trg_log_bl_status_change
      after insert or update on public.bons_livraison
      for each row execute function public.log_bl_status_change();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. update_livreur_last_assigned — profiles.last_assigned_at timestamp
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.update_livreur_last_assigned()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.livreur_id is not null
     and (old.livreur_id is null or old.livreur_id is distinct from new.livreur_id)
  then
    update public.profiles
       set last_assigned_at = now()
     where id = new.livreur_id;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_update_last_assigned' and tgrelid = 'public.bons_livraison'::regclass) then
    create trigger trg_update_last_assigned
      after insert or update of livreur_id on public.bons_livraison
      for each row execute function public.update_livreur_last_assigned();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. set_creneau_heures — Horaires par défaut pour creneau_type
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.set_creneau_heures()
returns trigger
language plpgsql
as $$
begin
  if new.heure_debut is null or new.heure_fin is null then
    case new.type_creneau
      when 'matin'      then new.heure_debut := '09:00'; new.heure_fin := '12:00';
      when 'apres_midi' then new.heure_debut := '14:00'; new.heure_fin := '18:00';
      when 'soir'       then new.heure_debut := '18:00'; new.heure_fin := '20:00';
    end case;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_creneau_heures' and tgrelid = 'public.creneaux_livraison'::regclass) then
    create trigger trg_creneau_heures
      before insert or update on public.creneaux_livraison
      for each row execute function public.set_creneau_heures();
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. auto_assign_livreur — Affectation automatique au livreur le moins chargé
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.auto_assign_livreur(p_date date default current_date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dow         text;
  v_livreur_id  uuid;
begin
  v_dow := lower(to_char(p_date, 'FMday'));
  select p.id
    into v_livreur_id
    from public.profiles p
   where p.role = 'livreur'
     and p.is_active = true
     and (
       p.weekly_schedule is null
       or p.weekly_schedule = '{}'::jsonb
       or p.weekly_schedule ? v_dow
     )
   order by (
     select count(*)
       from public.bons_livraison b
      where b.livreur_id = p.id
        and b.statut in ('assigne','confirme','release_demandee','en_livraison','en_route')
   ) asc,
     coalesce(p.last_assigned_at, '1970-01-01'::timestamptz) asc
   limit 1;
  return v_livreur_id;
end;
$$;

revoke all     on function public.auto_assign_livreur(date) from public;
grant  execute on function public.auto_assign_livreur(date) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. purge_old_driver_locations — Nettoyage GPS glissant 30 jours
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.purge_old_driver_locations()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_deleted int;
begin
  delete from public.driver_locations
   where recorded_at < now() - interval '30 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. anonymize_client — RGPD Suppression
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.anonymize_client(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using
      errcode = '42501',
      hint    = 'Only admins can anonymize a client (RGPD).';
  end if;

  update public.clients set
    nom                  = 'ANONYMIZED',
    prenom               = null,
    email                = null,
    telephone            = null,
    adresse_ligne1       = '[supprimée]',
    adresse_ligne2       = null,
    code_postal          = null,
    ville                = null,
    latitude             = null,
    longitude            = null,
    code_porte           = null,
    commentaire_acces    = null,
    shopify_customer_id  = null,
    anonymized_at        = now()
  where id = p_client_id;
end;
$$;

revoke all     on function public.anonymize_client(uuid) from public;
grant  execute on function public.anonymize_client(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Vues projections pour le Livreur
-- ─────────────────────────────────────────────────────────────────────────────

-- 11.1 BL du jour du livreur connecté
create or replace view public.v_bl_today as
select
  bl.id, bl.numero_bl, bl.statut, bl.creneau, bl.date_livraison_prevue,
  bl.mode_livraison, bl.montant_total_ttc, bl.montant_frais_relivraison,
  bl.nb_tentatives,
  c.nom as client_nom, c.prenom as client_prenom, c.telephone as client_telephone,
  c.email as client_email, c.adresse_ligne1 as client_adresse,
  c.code_postal as client_cp, c.ville as client_ville,
  c.latitude as client_lat, c.longitude as client_lng,
  c.etage as client_etage, c.ascenseur as client_ascenseur,
  c.code_porte as client_code_porte, c.commentaire_acces as client_commentaire,
  cmd.numero_commande, cmd.date_commande,
  (
    select jsonb_agg(jsonb_build_object(
      'designation', l.designation,
      'marque',      l.marque,
      'modele',      l.modele,
      'quantite',    l.quantite,
      'fragile',     l.fragile,
      'poids_kg',    l.poids_kg,
      'volume_m3',   l.volume_m3
    ) order by l.ordre_tri)
    from public.lignes_bl l
    where l.bl_id = bl.id
  ) as articles
from public.bons_livraison bl
join public.clients   c   on c.id   = bl.client_id
join public.commandes cmd on cmd.id = bl.commande_id
where bl.livreur_id = auth.uid()
  and bl.date_livraison_prevue = current_date;

-- 11.2 KPIs journaliers du livreur connecté
create or replace view public.v_kpis_today as
select
  livreur_id,
  count(*) filter (where date_livraison_prevue = current_date) as bl_aujourd_hui,
  count(*) filter (where statut = 'signe' and date(date_signature) = current_date) as livres_signes_today,
  count(*) filter (where statut in ('en_livraison','en_route') and date_livraison_prevue = current_date) as en_cours,
  count(*) filter (where statut in ('assigne','confirme','release_demandee') and date_livraison_prevue = current_date) as restant,
  round(
    100.0 * count(*) filter (where statut = 'signe' and date(date_signature) = current_date)
    / nullif(count(*) filter (where statut in ('signe','signature_expiree','livre') and date_livraison_prevue = current_date), 0),
    1
  ) as taux_signature_pct
from public.bons_livraison
where livreur_id is not null
group by livreur_id;

-- 11.3 Créneaux hebdomadaires
create or replace view public.v_creneaux_semaine as
select
  livreur_id, date_creneau, type_creneau, statut, bl_id,
  extract(dow from date_creneau) as day_of_week
from public.creneaux_livraison
where date_creneau between current_date and current_date + interval '7 days'
order by date_creneau, type_creneau;

grant select on
  public.v_bl_today,
  public.v_kpis_today,
  public.v_creneaux_semaine
to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Index de performance
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists idx_profiles_active_role
  on public.profiles (role) where is_active = true;
create index if not exists idx_profiles_active_livreurs
  on public.profiles (role) where role = 'livreur' and is_active = true;

create index if not exists idx_clients_email
  on public.clients (email) where email is not null;
create index if not exists idx_clients_shopify
  on public.clients (shopify_customer_id) where shopify_customer_id is not null;
create index if not exists idx_clients_geo
  on public.clients (latitude, longitude) where latitude is not null;

create index if not exists idx_commandes_client     on public.commandes (client_id);
create index if not exists idx_commandes_shopify    on public.commandes (shopify_order_id);
create index if not exists idx_commandes_statut     on public.commandes (statut, date_commande desc);

create index if not exists idx_bl_livreur     on public.bons_livraison (livreur_id, statut);
create index if not exists idx_bl_vendeur     on public.bons_livraison (vendeur_id);
create index if not exists idx_bl_client      on public.bons_livraison (client_id);
create index if not exists idx_bl_commande    on public.bons_livraison (commande_id);
create index if not exists idx_bl_statut      on public.bons_livraison (statut);
create index if not exists idx_bl_date_creneau
  on public.bons_livraison (date_livraison_prevue, creneau);
create index if not exists idx_bl_today_per_driver
  on public.bons_livraison (livreur_id, date_livraison_prevue)
  where statut in ('confirme','release_demandee','en_livraison','en_route');

create index if not exists idx_lignes_bl_bl
  on public.lignes_bl (bl_id);
create index if not exists idx_lignes_bl_article
  on public.lignes_bl (article_id) where article_id is not null;

create index if not exists idx_creneaux_livreur_date
  on public.creneaux_livraison (livreur_id, date_creneau);
create index if not exists idx_creneaux_disponibles
  on public.creneaux_livraison (date_creneau, type_creneau)
  where statut = 'disponible';
create index if not exists idx_creneaux_bl
  on public.creneaux_livraison (bl_id) where bl_id is not null;

create index if not exists idx_signatures_token
  on public.signatures_electroniques (token);
create index if not exists idx_signatures_status
  on public.signatures_electroniques (statut);
create index if not exists idx_signatures_expiration
  on public.signatures_electroniques (date_expiration) where statut = 'en_attente';
create index if not exists idx_signatures_signed_at
  on public.signatures_electroniques (date_signature) where statut = 'signe';

create index if not exists idx_driver_loc_recent
  on public.driver_locations (driver_id, recorded_at desc);
create index if not exists idx_driver_loc_bl
  on public.driver_locations (bl_id, recorded_at desc) where bl_id is not null;

create index if not exists idx_notif_user_unread
  on public.notifications (user_id, created_at desc) where read_at is null;
create index if not exists idx_notif_user_all
  on public.notifications (user_id, created_at desc);

create index if not exists idx_push_user
  on public.push_subscriptions (user_id) where is_active = true;

create index if not exists idx_attempt_bl
  on public.bl_attempt_log (bl_id, recorded_at desc);
create index if not exists idx_attempt_livreur
  on public.bl_attempt_log (livreur_id, recorded_at desc);

create index if not exists idx_status_history_bl
  on public.bl_status_history (bl_id, changed_at desc);
