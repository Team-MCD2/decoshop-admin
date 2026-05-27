-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Workflow & Performance RPCs (schéma `public.*` unifié)
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. allowed_bl_transitions — Graphe de la machine à états des BL
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.allowed_bl_transitions(
  p_from public.bl_status,
  p_caller_role public.user_role
)
returns public.bl_status[]
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_is_admin boolean := p_caller_role in ('admin','vendeur','vendeur_proprietaire');
  v_driver   public.bl_status[] := '{}';
  v_extra    public.bl_status[] := '{}';
begin
  case p_from
    when 'cree' then
      v_extra := array['assigne','bloque']::public.bl_status[];
    when 'assigne' then
      v_driver := array['confirme','release_demandee']::public.bl_status[];
      v_extra  := array['en_livraison','bloque','cree']::public.bl_status[];
    when 'confirme' then
      v_driver := array['en_livraison','release_demandee']::public.bl_status[];
      v_extra  := array['bloque','cree']::public.bl_status[];
    when 'release_demandee' then
      v_extra  := array['assigne','cree','bloque']::public.bl_status[];
    when 'bloque' then
      v_extra  := array['cree','assigne']::public.bl_status[];
    when 'en_livraison' then
      v_driver := array['en_route','echec_T1']::public.bl_status[];
      v_extra  := array['bloque']::public.bl_status[];
    when 'en_route' then
      v_driver := array['livre','echec_T1']::public.bl_status[];
      v_extra  := array['bloque']::public.bl_status[];
    when 'livre' then
      v_driver := array['signature_attendue','signe']::public.bl_status[];
      v_extra  := array['bloque']::public.bl_status[];
    when 'signature_attendue' then
      v_driver := array['signe']::public.bl_status[];
      v_extra  := array['livre']::public.bl_status[];
    when 'signature_expiree' then
      v_driver := array['signature_attendue','livre']::public.bl_status[];
    when 'echec_T1' then
      v_driver := array['en_livraison','echec_T2','retour_planifie']::public.bl_status[];
      v_extra  := array['abandon','bloque']::public.bl_status[];
    when 'echec_T2' then
      v_driver := array['retour_planifie']::public.bl_status[];
      v_extra  := array['abandon','bloque']::public.bl_status[];
    when 'abandon' then
      v_extra  := array['retour_planifie']::public.bl_status[];
    when 'retour_planifie' then
      v_driver := array['retour_en_cours']::public.bl_status[];
      v_extra  := array['abandon']::public.bl_status[];
    when 'retour_en_cours' then
      v_driver := array['retour_collecte']::public.bl_status[];
    else
      v_driver := '{}';
  end case;

  if v_is_admin then
    return v_driver || v_extra;
  else
    return v_driver;
  end if;
end;
$$;

revoke all     on function public.allowed_bl_transitions(public.bl_status, public.user_role) from public;
grant  execute on function public.allowed_bl_transitions(public.bl_status, public.user_role) to authenticated;


-- Wrapper de commodité résolu dynamiquement
create or replace function public.my_allowed_bl_transitions(p_from public.bl_status)
returns public.bl_status[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.allowed_bl_transitions(
    p_from,
    coalesce(public.current_user_role(), 'livreur'::public.user_role)
  );
$$;

revoke all     on function public.my_allowed_bl_transitions(public.bl_status) from public;
grant  execute on function public.my_allowed_bl_transitions(public.bl_status) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC transition_bl_status — Changement de statut unitaire du BL
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.transition_bl_status(
  p_bl_id      uuid,
  p_to_status  public.bl_status,
  p_metadata   jsonb default '{}'::jsonb
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id    uuid := auth.uid();
  v_role       public.user_role;
  v_bl         public.bons_livraison%rowtype;
  v_allowed    public.bl_status[];
  v_history_id uuid;
  v_started_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if v_role is null then
    raise exception 'PROFILE_NOT_FOUND' using
      errcode = 'P0002',
      hint    = 'L''utilisateur n''a pas de profil. L''admin doit le configurer.';
  end if;

  select * into v_bl from public.bons_livraison where id = p_bl_id for update;
  if not found then
    raise exception 'BL_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_bl.livreur_id is distinct from v_user_id
     and v_role not in ('admin','vendeur','vendeur_proprietaire')
  then
    raise exception 'BL_NOT_ASSIGNED_TO_YOU' using errcode = '42501';
  end if;

  if v_bl.statut = p_to_status then
    return json_build_object(
      'success',         true,
      'bl_id',           p_bl_id,
      'previous_status', v_bl.statut::text,
      'new_status',      p_to_status::text,
      'no_op',           true
    );
  end if;

  v_allowed := public.allowed_bl_transitions(v_bl.statut, v_role);
  if not (p_to_status = any(v_allowed)) then
    raise exception
      'INVALID_TRANSITION:%->%', v_bl.statut::text, p_to_status::text
      using errcode = 'P0001',
            hint    = 'Transitions possibles : ' || coalesce(array_to_string(v_allowed, ','), '<aucune>');
  end if;

  update public.bons_livraison
     set statut                   = p_to_status,
         date_livraison_effective = case
           when p_to_status in ('livre','signe')
            and date_livraison_effective is null then now()
           else date_livraison_effective
         end,
         date_signature           = case
           when p_to_status = 'signe' and date_signature is null then now()
           else date_signature
         end,
         updated_at               = now()
   where id = p_bl_id;

  update public.bl_status_history
     set metadata       = coalesce(p_metadata, '{}'::jsonb)
                          || jsonb_build_object('rpc', 'transition_bl_status'),
         trigger_source = 'rpc:transition_bl_status'
   where id = (
     select id from public.bl_status_history
      where bl_id = p_bl_id and changed_at >= v_started_at
      order by changed_at desc limit 1
   )
   returning id into v_history_id;

  return json_build_object(
    'success',         true,
    'bl_id',           p_bl_id,
    'previous_status', v_bl.statut::text,
    'new_status',      p_to_status::text,
    'history_id',      v_history_id,
    'changed_at',      now()
  );
end;
$$;

revoke all     on function public.transition_bl_status(uuid, public.bl_status, jsonb) from public;
grant  execute on function public.transition_bl_status(uuid, public.bl_status, jsonb) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC record_failed_attempt — Enregistrement d'un échec de livraison
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.record_failed_attempt(
  p_bl_id            uuid,
  p_motif            public.attempt_failure_reason,
  p_commentaire      text    default null,
  p_photo_litige_url text    default null,
  p_latitude         numeric default null,
  p_longitude        numeric default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id        uuid := auth.uid();
  v_role           public.user_role;
  v_bl             public.bons_livraison%rowtype;
  v_new_attempts   int;
  v_new_status     public.bl_status;
  v_is_force_maj   boolean;
  v_started_at     timestamptz := clock_timestamp();
  v_attempt_event  jsonb;
  v_attempt_row_id uuid;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if v_role is null then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_bl from public.bons_livraison where id = p_bl_id for update;
  if not found then
    raise exception 'BL_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_bl.livreur_id is distinct from v_user_id
     and v_role not in ('admin','vendeur','vendeur_proprietaire')
  then
    raise exception 'BL_NOT_ASSIGNED_TO_YOU' using errcode = '42501';
  end if;

  if v_bl.statut not in ('en_livraison','en_route','echec_T1') then
    raise exception
      'INVALID_BL_STATUS_FOR_FAILURE:%', v_bl.statut::text
      using errcode = 'P0001',
            hint    = 'Les échecs se déclarent depuis en_livraison, en_route ou echec_T1.';
  end if;

  v_new_attempts := coalesce(v_bl.nb_tentatives, 0) + 1;
  if v_new_attempts > 3 then
    raise exception 'MAX_ATTEMPTS_REACHED' using
      errcode = 'P0001',
      hint    = 'BL à 3 tentatives déjà enregistrées. Passer en retour_planifie ou abandon.';
  end if;

  v_new_status := case
    when v_new_attempts = 1 then 'echec_T1'::public.bl_status
    when v_new_attempts = 2 then 'echec_T2'::public.bl_status
    when v_new_attempts = 3 then 'abandon'::public.bl_status
  end;

  v_is_force_maj := p_motif in ('meteo','panne_vehicule','articles_endommages','colis_perdu');

  v_attempt_event := jsonb_build_object(
    'attempt_number',   v_new_attempts,
    'motif',            p_motif::text,
    'commentaire',      p_commentaire,
    'photo_litige_url', p_photo_litige_url,
    'latitude',         p_latitude,
    'longitude',        p_longitude,
    'force_majeure',    v_is_force_maj,
    'recorded_at',      now(),
    'recorded_by',      v_user_id,
    'previous_status',  v_bl.statut::text,
    'new_status',       v_new_status::text
  );

  insert into public.bl_attempt_log (
    bl_id, livreur_id, numero_tentative, motif,
    commentaire, photo_litige_url, latitude, longitude, recorded_at
  ) values (
    p_bl_id, coalesce(v_bl.livreur_id, v_user_id), v_new_attempts, p_motif,
    p_commentaire, p_photo_litige_url, p_latitude, p_longitude, now()
  )
  returning id into v_attempt_row_id;

  update public.bons_livraison
     set statut         = v_new_status,
         nb_tentatives  = v_new_attempts,
         attempt_log    = coalesce(attempt_log, '[]'::jsonb)
                          || jsonb_build_array(v_attempt_event),
         admin_waiver   = admin_waiver or v_is_force_maj,
         photo_litige_url = coalesce(p_photo_litige_url, photo_litige_url),
         updated_at     = now()
   where id = p_bl_id;

  update public.bl_status_history
     set metadata       = jsonb_build_object(
                             'rpc',              'record_failed_attempt',
                             'attempt_number',   v_new_attempts,
                             'motif',            p_motif::text,
                             'force_majeure',    v_is_force_maj,
                             'attempt_log_id',   v_attempt_row_id
                           ),
         trigger_source = 'rpc:record_failed_attempt'
   where id = (
     select id from public.bl_status_history
      where bl_id = p_bl_id and changed_at >= v_started_at
      order by changed_at desc limit 1
   );

  if v_bl.vendeur_id is not null and v_bl.vendeur_id is distinct from v_user_id then
    insert into public.notifications (
      user_id, type, title, body, bl_id, link, metadata
    ) values (
      v_bl.vendeur_id,
      'bl_attempt_failed',
      'Tentative échouée',
      'BL ' || v_bl.numero_bl || ' — tentative ' || v_new_attempts || '/3 (' || p_motif::text || ')',
      p_bl_id,
      '/bl/' || p_bl_id::text,
      jsonb_build_object(
        'attempt_number', v_new_attempts,
        'motif',          p_motif::text,
        'new_status',     v_new_status::text,
        'force_majeure',  v_is_force_maj
      )
    );
  end if;

  return json_build_object(
    'success',         true,
    'bl_id',           p_bl_id,
    'previous_status', v_bl.statut::text,
    'new_status',      v_new_status::text,
    'attempt_number',  v_new_attempts,
    'attempt_log_id',  v_attempt_row_id,
    'force_majeure',   v_is_force_maj,
    'recorded_at',     now()
  );
end;
$$;

revoke all     on function public.record_failed_attempt(uuid, public.attempt_failure_reason, text, text, numeric, numeric) from public;
grant  execute on function public.record_failed_attempt(uuid, public.attempt_failure_reason, text, text, numeric, numeric) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RPC get_driver_daily_kpis — Données KPIs journalières
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_driver_daily_kpis(
  p_date       date default current_date,
  p_driver_id  uuid default null
)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id    uuid := auth.uid();
  v_role       public.user_role;
  v_target     uuid;
  v_total          int := 0;
  v_delivered      int := 0;
  v_signed         int := 0;
  v_in_progress    int := 0;
  v_remaining      int := 0;
  v_failed_t1      int := 0;
  v_failed_t2      int := 0;
  v_abandoned      int := 0;
  v_signature_rate numeric(5,2) := 0;
  v_success_rate   numeric(5,2) := 0;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  v_target := coalesce(p_driver_id, v_user_id);

  if v_target <> v_user_id
     and v_role not in ('admin','vendeur','vendeur_proprietaire')
  then
    raise exception 'FORBIDDEN' using
      errcode = '42501',
      hint    = 'Seuls admin/vendeur peuvent lire les KPIs d''autres livreurs.';
  end if;

  select
    count(*),
    count(*) filter (where statut in ('livre','signe')),
    count(*) filter (where statut = 'signe'),
    count(*) filter (where statut in ('en_livraison','en_route','signature_attendue')),
    count(*) filter (where statut in ('assigne','confirme','release_demandee')),
    count(*) filter (where statut = 'echec_T1'),
    count(*) filter (where statut = 'echec_T2'),
    count(*) filter (where statut = 'abandon')
  into
    v_total, v_delivered, v_signed, v_in_progress, v_remaining,
    v_failed_t1, v_failed_t2, v_abandoned
    from public.bons_livraison
   where livreur_id           = v_target
     and date_livraison_prevue = p_date;

  if v_delivered > 0 then
    v_signature_rate := round(100.0 * v_signed / v_delivered, 1);
  end if;
  if v_total > 0 then
    v_success_rate := round(100.0 * v_delivered / v_total, 1);
  end if;

  return json_build_object(
    'driver_id',       v_target,
    'date',            p_date,
    'total',           v_total,
    'delivered',       v_delivered,
    'signed',          v_signed,
    'in_progress',     v_in_progress,
    'remaining',       v_remaining,
    'failed_t1',       v_failed_t1,
    'failed_t2',       v_failed_t2,
    'abandoned',       v_abandoned,
    'signature_rate',  case when v_delivered > 0 then v_signature_rate else null end,
    'success_rate',    case when v_total     > 0 then v_success_rate   else null end,
    'computed_at',     now()
  );
end;
$$;

revoke all     on function public.get_driver_daily_kpis(date, uuid) from public;
grant  execute on function public.get_driver_daily_kpis(date, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC get_driver_period_score — Scorecard d'analyse sur une période
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_driver_period_score(
  p_from       date default (current_date - interval '30 days')::date,
  p_to         date default current_date,
  p_driver_id  uuid default null
)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_role     public.user_role;
  v_target   uuid;
  v_total          int := 0;
  v_delivered      int := 0;
  v_signed         int := 0;
  v_failed         int := 0;
  v_abandoned      int := 0;
  v_on_time        int := 0;
  v_total_attempts int := 0;
  v_days_active    int := 0;
  v_signature_rate numeric(5,2);
  v_success_rate   numeric(5,2);
  v_failure_rate   numeric(5,2);
  v_on_time_rate   numeric(5,2);
  v_avg_attempts   numeric(5,2);
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if p_from > p_to then
    raise exception 'INVALID_PERIOD' using
      errcode = '22023',
      hint    = 'p_from doit être inférieur ou égal à p_to.';
  end if;
  if p_to - p_from > 366 then
    raise exception 'PERIOD_TOO_LONG' using
      errcode = '22023',
      hint    = 'La période maximale est de 366 jours.';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  v_target := coalesce(p_driver_id, v_user_id);

  if v_target <> v_user_id
     and v_role not in ('admin','vendeur','vendeur_proprietaire')
  then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

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
    coalesce(sum(nb_tentatives) filter (
      where statut in ('echec_T1','echec_T2','abandon')
    ), 0)::int,
    count(distinct date_livraison_prevue)
  into
    v_total, v_delivered, v_signed, v_failed, v_abandoned,
    v_on_time, v_total_attempts, v_days_active
    from public.bons_livraison
   where livreur_id            = v_target
     and date_livraison_prevue between p_from and p_to;

  v_signature_rate := case when v_delivered > 0
    then round(100.0 * v_signed / v_delivered, 1) end;
  v_success_rate   := case when v_total > 0
    then round(100.0 * v_delivered / v_total, 1) end;
  v_failure_rate   := case when v_total > 0
    then round(100.0 * (v_failed + v_abandoned) / v_total, 1) end;
  v_on_time_rate   := case when v_delivered > 0
    then round(100.0 * v_on_time / v_delivered, 1) end;
  v_avg_attempts   := case when (v_failed + v_abandoned) > 0
    then round(1.0 * v_total_attempts / (v_failed + v_abandoned), 2) end;

  return json_build_object(
    'driver_id',                  v_target,
    'period_from',                p_from,
    'period_to',                  p_to,
    'period_days',                (p_to - p_from + 1),
    'total',                      v_total,
    'delivered',                  v_delivered,
    'signed',                     v_signed,
    'failed',                     v_failed,
    'abandoned',                  v_abandoned,
    'on_time',                    v_on_time,
    'days_active',                v_days_active,
    'signature_rate',             v_signature_rate,
    'success_rate',               v_success_rate,
    'failure_rate',               v_failure_rate,
    'on_time_rate',               v_on_time_rate,
    'avg_attempts_per_failed_bl', v_avg_attempts,
    'computed_at',                now()
  );
end;
$$;

revoke all     on function public.get_driver_period_score(date, date, uuid) from public;
grant  execute on function public.get_driver_period_score(date, date, uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Trigger d'auto-provisioning — auth.users → public.profiles
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_new_livreur_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nom      text;
  v_prenom   text;
  v_phone    text;
  v_lang     text;
begin
  v_nom    := nullif(trim(new.raw_user_meta_data ->> 'nom'),    '');
  v_prenom := nullif(trim(new.raw_user_meta_data ->> 'prenom'), '');
  v_phone  := nullif(trim(new.raw_user_meta_data ->> 'telephone'), '');
  v_lang   := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'preferred_language'), ''),
    'fr'
  );
  if v_lang not in ('fr','ar') then
    v_lang := 'fr';
  end if;

  begin
    insert into public.profiles (
      id, email, nom, prenom, telephone,
      role, is_active, preferred_language
    ) values (
      new.id,
      new.email,
      v_nom,
      v_prenom,
      v_phone,
      'livreur'::public.user_role,
      false,
      v_lang
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_livreur_user failed for %: % %',
      new.id, sqlstate, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_livreur on auth.users;
create trigger on_auth_user_created_livreur
  after insert on auth.users
  for each row execute function public.handle_new_livreur_user();


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Publication Realtime
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_pub_exists boolean;
  v_tbl_exists boolean;
begin
  select exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    into v_pub_exists;
  if not v_pub_exists then
    return;
  end if;

  -- bons_livraison
  select exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'bons_livraison'
  ) into v_tbl_exists;
  if not v_tbl_exists then
    alter publication supabase_realtime add table public.bons_livraison;
  end if;

  -- notifications
  select exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'notifications'
  ) into v_tbl_exists;
  if not v_tbl_exists then
    alter publication supabase_realtime add table public.notifications;
  end if;

  -- signatures_electroniques
  select exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'signatures_electroniques'
  ) into v_tbl_exists;
  if not v_tbl_exists then
    alter publication supabase_realtime add table public.signatures_electroniques;
  end if;

  -- driver_locations
  select exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'driver_locations'
  ) into v_tbl_exists;
  if not v_tbl_exists then
    alter publication supabase_realtime add table public.driver_locations;
  end if;
end $$;
