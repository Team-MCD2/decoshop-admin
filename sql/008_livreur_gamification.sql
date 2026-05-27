-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Gamification & Badges Schema & RPCs (schéma `public.*` unifié)
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tables de Gamification
-- ─────────────────────────────────────────────────────────────────────────────

-- Table pour stocker les badges gagnés par les livreurs
create table if not exists public.driver_badges (
  id           uuid          primary key default gen_random_uuid(),
  driver_id    uuid          not null references public.profiles(id) on delete cascade,
  badge_key    text          not null, -- 'bronze_delivery', 'silver_delivery', 'gold_delivery', 'perfect_week', 'fast_signer', 'ruler_of_the_road'
  earned_at    timestamptz   not null default now(),
  metadata     jsonb         not null default '{}'::jsonb,
  constraint uq_driver_badge unique (driver_id, badge_key)
);

create index if not exists idx_driver_badges_driver on public.driver_badges(driver_id);

-- Table pour stocker l'historique des snapshots de performance quotidienne
create table if not exists public.driver_performance_snapshots (
  id              uuid          primary key default gen_random_uuid(),
  driver_id       uuid          not null references public.profiles(id) on delete cascade,
  snapshot_date   date          not null,
  quality_score   numeric(5, 2) not null, -- Score global calculé sur 100
  signature_rate  numeric(5, 2),          -- Taux de signature sur la période (%)
  success_rate    numeric(5, 2),          -- Taux de succès de livraison (%)
  on_time_rate    numeric(5, 2),          -- Taux de ponctualité (%)
  days_active     int           not null default 1,
  created_at      timestamptz   not null default now(),
  constraint uq_driver_snapshot unique (driver_id, snapshot_date)
);

create index if not exists idx_driver_snapshots_driver on public.driver_performance_snapshots(driver_id, snapshot_date desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Sécurité RLS et Droits d'accès
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.driver_badges enable row level security;
alter table public.driver_performance_snapshots enable row level security;

grant select on public.driver_badges to anon, authenticated;
grant select on public.driver_performance_snapshots to anon, authenticated;

-- RLS: Les livreurs lisent leurs propres données; les admins/vendeurs lisent tout.
create policy driver_badges_select on public.driver_badges
  for select to authenticated
  using (
    driver_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role in ('admin', 'vendeur', 'vendeur_proprietaire')
    )
  );

create policy driver_snapshots_select on public.driver_performance_snapshots
  for select to authenticated
  using (
    driver_id = auth.uid()
    or exists (
      select 1 from public.profiles
      where id = auth.uid()
      and role in ('admin', 'vendeur', 'vendeur_proprietaire')
    )
  );

-- Les écritures dans les badges et snapshots sont restreintes au service_role / system.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Fonctions & RPCs de Calcul de Performance & Gamification
-- ─────────────────────────────────────────────────────────────────────────────

-- Calcule et insère un snapshot de performance pour un chauffeur et une date donnée (période glissante de 30 jours par défaut)
create or replace function public.calculate_driver_performance(
  p_driver_id uuid,
  p_date date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from           date;
  v_total          int := 0;
  v_delivered      int := 0;
  v_signed         int := 0;
  v_failed         int := 0;
  v_abandoned      int := 0;
  v_on_time        int := 0;
  v_days_active    int := 0;
  v_signature_rate numeric(5,2) := 100.00;
  v_success_rate   numeric(5,2) := 100.00;
  v_on_time_rate   numeric(5,2) := 100.00;
  v_quality_score  numeric(5,2) := 100.00;
  v_result         jsonb;
begin
  -- Période glissante de 30 jours pour le calcul du snapshot
  v_from := p_date - interval '30 days';

  -- Récupérer les métriques d'activité
  select
    count(*),
    count(*) filter (where statut in ('livre','signe')),
    count(*) filter (where statut = 'signe'),
    count(*) filter (where statut in ('echec_T1','echec_T2')),
    count(*) filter (where statut = 'abandon'),
    count(*) filter (
      where statut in ('livre','signe')
        and date_livraison_effective is not null
        and date_livraison_effective::date <= date_livraison_prevue
    ),
    count(distinct date_livraison_prevue)
  into
    v_total, v_delivered, v_signed, v_failed, v_abandoned,
    v_on_time, v_days_active
  from public.bons_livraison
  where livreur_id = p_driver_id
    and date_livraison_prevue between v_from and p_date;

  -- Calculer les pourcentages s'il y a de l'activité
  if v_delivered > 0 then
    v_signature_rate := round(100.0 * v_signed / v_delivered, 2);
    v_on_time_rate := round(100.0 * v_on_time / v_delivered, 2);
  end if;

  if v_total > 0 then
    v_success_rate := round(100.0 * v_delivered / v_total, 2);
    -- Formule pondérée : Succès de livraison (40%) + Signature électronique (40%) + Ponctualité (20%)
    v_quality_score := round(
      (v_success_rate * 0.40) + 
      (v_signature_rate * 0.40) + 
      (v_on_time_rate * 0.20), 
      2
    );
  else
    v_quality_score := 100.00; -- Score par défaut sans activité
  end if;

  -- Upsert le snapshot de performance
  insert into public.driver_performance_snapshots (
    driver_id, snapshot_date, quality_score, signature_rate, success_rate, on_time_rate, days_active
  ) values (
    p_driver_id, p_date, v_quality_score, v_signature_rate, v_success_rate, v_on_time_rate, coalesce(v_days_active, 0)
  )
  on conflict (driver_id, snapshot_date) do update set
    quality_score = excluded.quality_score,
    signature_rate = excluded.signature_rate,
    success_rate = excluded.success_rate,
    on_time_rate = excluded.on_time_rate,
    days_active = excluded.days_active,
    created_at = now()
  returning jsonb_build_object(
    'driver_id', driver_id,
    'date', snapshot_date,
    'quality_score', quality_score,
    'signature_rate', signature_rate,
    'success_rate', success_rate,
    'on_time_rate', on_time_rate,
    'days_active', days_active
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.calculate_driver_performance(uuid, date) to authenticated;


-- Analyse les performances et octroie les badges à un livreur donné
create or replace function public.check_and_award_badges(
  p_driver_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_signed_total     int := 0;
  v_week_signed      int := 0;
  v_week_failed      int := 0;
  v_ontime_rate_30d  numeric(5,2) := 0;
  v_avg_sign_time_s  numeric := null;
  v_badges_awarded   text[] := array[]::text[];
  v_result           jsonb;
begin
  -- 1. Récupérer le total de livraisons signées à vie
  select count(*) into v_signed_total
  from public.bons_livraison
  where livreur_id = p_driver_id and statut = 'signe';

  -- 2. Récupérer les stats des 7 derniers jours (pour Perfect Week)
  select 
    count(*) filter (where statut = 'signe'),
    count(*) filter (where statut in ('echec_T1','echec_T2','abandon'))
  into v_week_signed, v_week_failed
  from public.bons_livraison
  where livreur_id = p_driver_id
    and date_livraison_prevue >= (current_date - interval '7 days');

  -- 3. Récupérer le taux de ponctualité des 30 derniers jours (pour Ruler of the Road)
  select 
    coalesce(
      count(*) filter (
        where statut in ('livre','signe') 
          and date_livraison_effective is not null 
          and date_livraison_effective::date <= date_livraison_prevue
      )::numeric / nullif(count(*) filter (where statut in ('livre','signe')), 0) * 100, 
      0
    )
  into v_ontime_rate_30d
  from public.bons_livraison
  where livreur_id = p_driver_id
    and date_livraison_prevue >= (current_date - interval '30 days');

  -- 4. Temps moyen de signature client (pour Fast Signer)
  -- Mesure l'écart moyen entre date_livraison_effective (marque livré) et date_signature (client signe)
  select avg(extract(epoch from (date_signature - date_livraison_effective)))
  into v_avg_sign_time_s
  from public.bons_livraison
  where livreur_id = p_driver_id
    and statut = 'signe'
    and date_signature is not null
    and date_livraison_effective is not null;

  -- Évaluation des règles d'attribution des badges

  -- Badge Bronze : 10 livraisons signées
  if v_signed_total >= 10 then
    insert into public.driver_badges (driver_id, badge_key, metadata)
    values (p_driver_id, 'bronze_delivery', jsonb_build_object('signed_count', v_signed_total))
    on conflict (driver_id, badge_key) do nothing;
    
    if found then
      v_badges_awarded := array_append(v_badges_awarded, 'bronze_delivery');
    end if;
  end if;

  -- Badge Silver : 50 livraisons signées
  if v_signed_total >= 50 then
    insert into public.driver_badges (driver_id, badge_key, metadata)
    values (p_driver_id, 'silver_delivery', jsonb_build_object('signed_count', v_signed_total))
    on conflict (driver_id, badge_key) do nothing;
    
    if found then
      v_badges_awarded := array_append(v_badges_awarded, 'silver_delivery');
    end if;
  end if;

  -- Badge Gold : 100 livraisons signées
  if v_signed_total >= 100 then
    insert into public.driver_badges (driver_id, badge_key, metadata)
    values (p_driver_id, 'gold_delivery', jsonb_build_object('signed_count', v_signed_total))
    on conflict (driver_id, badge_key) do nothing;
    
    if found then
      v_badges_awarded := array_append(v_badges_awarded, 'gold_delivery');
    end if;
  end if;

  -- Badge Perfect Week : 0 échec et au moins 5 livraisons signées sur 7 jours
  if v_week_signed >= 5 and v_week_failed = 0 then
    insert into public.driver_badges (driver_id, badge_key, metadata)
    values (p_driver_id, 'perfect_week', jsonb_build_object('week_signed', v_week_signed))
    on conflict (driver_id, badge_key) do nothing;
    
    if found then
      v_badges_awarded := array_append(v_badges_awarded, 'perfect_week');
    end if;
  end if;

  -- Badge Fast Signer : Temps moyen de signature client < 5 minutes (300 secondes)
  if v_avg_sign_time_s is not null and v_avg_sign_time_s < 300 then
    insert into public.driver_badges (driver_id, badge_key, metadata)
    values (p_driver_id, 'fast_signer', jsonb_build_object('avg_sign_time_seconds', round(v_avg_sign_time_s::numeric, 1)))
    on conflict (driver_id, badge_key) do nothing;
    
    if found then
      v_badges_awarded := array_append(v_badges_awarded, 'fast_signer');
    end if;
  end if;

  -- Badge Ruler of the Road : >= 95% de ponctualité sur 30 jours (min 10 livraisons)
  if v_ontime_rate_30d >= 95.00 then
    -- Vérifier qu'on a bien au moins 10 livraisons livrées sur la période
    declare
      v_delivery_count int;
    begin
      select count(*) into v_delivery_count
      from public.bons_livraison
      where livreur_id = p_driver_id
        and statut in ('livre','signe')
        and date_livraison_prevue >= (current_date - interval '30 days');

      if v_delivery_count >= 10 then
        insert into public.driver_badges (driver_id, badge_key, metadata)
        values (p_driver_id, 'ruler_of_the_road', jsonb_build_object('on_time_rate_30d', v_ontime_rate_30d, 'total_deliveries', v_delivery_count))
        on conflict (driver_id, badge_key) do nothing;
        
        if found then
          v_badges_awarded := array_append(v_badges_awarded, 'ruler_of_the_road');
        end if;
      end if;
    end;
  end if;

  return jsonb_build_object(
    'driver_id', p_driver_id,
    'badges_awarded', v_badges_awarded,
    'total_badges', (select count(*) from public.driver_badges where driver_id = p_driver_id)
  );
end;
$$;

grant execute on function public.check_and_award_badges(uuid) to authenticated;


-- RPC Trigger automatique ou exécution planifiée pour les badges
create or replace function public.trigger_calculate_and_award()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Exécuter seulement si le statut passe à 'signe' (fin de livraison réussie)
  -- ou à un statut d'échec
  if (TG_OP = 'UPDATE' and new.statut is distinct from old.statut and new.statut in ('signe', 'echec_T1', 'echec_T2', 'abandon')) then
    if new.livreur_id is not null then
      perform public.calculate_driver_performance(new.livreur_id, current_date);
      perform public.check_and_award_badges(new.livreur_id);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_calculate_and_award on public.bons_livraison;
create trigger trg_calculate_and_award
  after update on public.bons_livraison
  for each row execute function public.trigger_calculate_and_award();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Enregistrement de la migration
-- ─────────────────────────────────────────────────────────────────────────────
insert into public._migrations (filename, app, checksum)
values ('008_livreur_gamification.sql', 'livreur', null)
on conflict (filename) do nothing;
