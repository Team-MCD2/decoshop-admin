-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Signature RPCs (schéma `public.*` unifié)
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. request_signature(p_bl_id, p_ttl_minutes)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.request_signature(
  p_bl_id        uuid,
  p_ttl_minutes  int default 10
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id     uuid := auth.uid();
  v_role        public.user_role;
  v_bl          public.bons_livraison%rowtype;
  v_client      public.clients%rowtype;
  v_token       text;
  v_expiration  timestamptz;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;

  select * into v_bl from public.bons_livraison where id = p_bl_id;
  if not found then
    raise exception 'BL_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_bl.livreur_id is distinct from v_user_id
     and v_role not in ('admin','vendeur','vendeur_proprietaire')
  then
    raise exception 'BL_NOT_ASSIGNED_TO_YOU' using errcode = '42501';
  end if;

  if v_bl.statut not in ('livre','signature_attendue','signature_expiree') then
    raise exception 'INVALID_BL_STATUS:%', v_bl.statut using errcode = 'P0001';
  end if;

  if p_ttl_minutes < 1 or p_ttl_minutes > 60 then
    p_ttl_minutes := 10;
  end if;

  select * into v_client from public.clients where id = v_bl.client_id;
  if v_client.email is null or length(trim(v_client.email)) = 0 then
    raise exception 'CLIENT_HAS_NO_EMAIL' using
      errcode = '22023',
      hint    = 'Le client doit avoir une adresse email pour recevoir le lien de signature.';
  end if;

  v_token      := encode(gen_random_bytes(32), 'hex');
  v_expiration := now() + (p_ttl_minutes || ' minutes')::interval;

  insert into public.signatures_electroniques (
    bl_id, token, email_client, statut,
    date_emission, date_expiration, retry_count
  ) values (
    p_bl_id, v_token, v_client.email, 'en_attente',
    now(), v_expiration, 0
  )
  on conflict (bl_id) do update set
    token              = excluded.token,
    email_client       = excluded.email_client,
    statut             = 'en_attente',
    signature_data     = null,
    signature_png_url  = null,
    signe_par_parent   = false,
    parent_nom         = null,
    parent_lien        = null,
    client_ip          = null,
    user_agent         = null,
    date_emission      = now(),
    date_expiration    = v_expiration,
    date_signature     = null,
    retry_count        = public.signatures_electroniques.retry_count + 1;

  update public.bons_livraison
     set statut     = 'signature_attendue',
         updated_at = now()
   where id = p_bl_id;

  return json_build_object(
    'token',           v_token,
    'bl_id',           p_bl_id,
    'url_path',        '/sign/' || v_token,
    'date_emission',   now(),
    'date_expiration', v_expiration,
    'ttl_minutes',     p_ttl_minutes,
    'email_client',    v_client.email
  );
end;
$$;

revoke all     on function public.request_signature(uuid, int) from public;
grant  execute on function public.request_signature(uuid, int) to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. submit_signature(p_token, p_signature_data, ...)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.submit_signature(
  p_token             text,
  p_signature_data    text,
  p_signe_par_parent  boolean default false,
  p_parent_nom        text    default null,
  p_parent_lien       text    default null,
  p_user_agent        text    default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sig         public.signatures_electroniques%rowtype;
  v_bl_numero   text;
  v_livreur_id  uuid;
  v_vendeur_id  uuid;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_TOKEN' using errcode = '22023';
  end if;
  if p_signature_data is null or length(p_signature_data) < 100 then
    raise exception 'INVALID_SIGNATURE_DATA' using errcode = '22023';
  end if;
  if p_signe_par_parent and (p_parent_nom is null or length(trim(p_parent_nom)) < 2) then
    raise exception 'PARENT_NAME_REQUIRED' using errcode = '22023';
  end if;

  select * into v_sig
    from public.signatures_electroniques
   where token = p_token
   for update;

  if not found then
    raise exception 'SIGNATURE_TOKEN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_sig.statut = 'signe' then
    raise exception 'ALREADY_SIGNED' using errcode = 'P0001';
  end if;
  if v_sig.statut = 'expire' or v_sig.date_expiration < now() then
    update public.signatures_electroniques set statut = 'expire' where id = v_sig.id;
    update public.bons_livraison
       set statut = 'signature_expiree'
     where id = v_sig.bl_id and statut = 'signature_attendue';
    raise exception 'SIGNATURE_EXPIRED' using errcode = 'P0001';
  end if;

  update public.signatures_electroniques
     set statut            = 'signe',
         signature_data    = p_signature_data,
         signe_par_parent  = coalesce(p_signe_par_parent, false),
         parent_nom        = p_parent_nom,
         parent_lien       = p_parent_lien,
         user_agent        = p_user_agent,
         date_signature    = now()
   where id = v_sig.id;

  update public.bons_livraison
     set statut                    = 'signe',
         date_signature            = now(),
         date_livraison_effective  = coalesce(date_livraison_effective, now()),
         updated_at                = now()
   where id = v_sig.bl_id
   returning numero_bl, livreur_id, vendeur_id
        into v_bl_numero, v_livreur_id, v_vendeur_id;

  if v_livreur_id is not null then
    insert into public.notifications (user_id, type, title, body, bl_id, link, metadata)
    values (
      v_livreur_id, 'bl_signed',
      'Signature OK',
      'Le client a signé le BL ' || v_bl_numero,
      v_sig.bl_id, '/bl/' || v_sig.bl_id::text,
      jsonb_build_object('signature_id', v_sig.id, 'signed_at', now())
    );
  end if;

  if v_vendeur_id is not null and v_vendeur_id is distinct from v_livreur_id then
    insert into public.notifications (user_id, type, title, body, bl_id, link, metadata)
    values (
      v_vendeur_id, 'bl_signed',
      'Livraison signée',
      'BL ' || v_bl_numero || ' signé par le client',
      v_sig.bl_id, '/bl/' || v_sig.bl_id::text,
      jsonb_build_object('signature_id', v_sig.id, 'signed_at', now())
    );
  end if;

  return json_build_object(
    'success',   true,
    'bl_id',     v_sig.bl_id,
    'numero_bl', v_bl_numero,
    'signed_at', now()
  );
end;
$$;

revoke all     on function public.submit_signature(text, text, boolean, text, text, text) from public;
grant  execute on function public.submit_signature(text, text, boolean, text, text, text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_signature_public(p_token)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_signature_public(p_token text)
returns json
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_sig     public.signatures_electroniques%rowtype;
  v_bl      public.bons_livraison%rowtype;
  v_client  public.clients%rowtype;
begin
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_TOKEN' using errcode = '22023';
  end if;
 
  select * into v_sig from public.signatures_electroniques where token = p_token;
  if not found then
    raise exception 'TOKEN_NOT_FOUND' using errcode = 'P0002';
  end if;
 
  select * into v_bl     from public.bons_livraison where id = v_sig.bl_id;
  select * into v_client from public.clients        where id = v_bl.client_id;
 
  return json_build_object(
    'status',                v_sig.statut::text,
    'is_expired',            v_sig.date_expiration < now(),
    'is_signed',             v_sig.statut = 'signe',
    'date_signature',        v_sig.date_signature,
    'signature_data',        v_sig.signature_data,
    'signe_par_parent',      v_sig.signe_par_parent,
    'parent_nom',            v_sig.parent_nom,
    'parent_lien',           v_sig.parent_lien,
    'date_emission',         v_sig.date_emission,
    'date_expiration',       v_sig.date_expiration,
    'numero_bl',             v_bl.numero_bl,
    'numero_commande',       (select numero_commande from public.commandes where id = v_bl.commande_id),
    'montant_total_ttc',     v_bl.montant_total_ttc,
    'mode_livraison',        v_bl.mode_livraison::text,
    'creneau',               v_bl.creneau::text,
    'date_livraison_prevue', v_bl.date_livraison_prevue,
    'client_nom',            v_client.nom,
    'client_prenom',         v_client.prenom,
    'client_ville',          v_client.ville,
    'articles_count',        (select count(*)::int from public.lignes_bl where bl_id = v_bl.id),
    'lignes',                (select coalesce(json_agg(t), '[]'::json) from (select designation, quantite, prix_unitaire_ttc, fragile from public.lignes_bl where bl_id = v_bl.id order by ordre_tri) t)
  );
end;
$$;
 
revoke all     on function public.get_signature_public(text) from public;
grant  execute on function public.get_signature_public(text) to anon, authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. expire_pending_signatures() — cron de nettoyage
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.expire_pending_signatures()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int := 0;
  rec     record;
begin
  for rec in
    update public.signatures_electroniques
       set statut = 'expire'
     where statut = 'en_attente'
       and date_expiration < now()
    returning id, bl_id
  loop
    update public.bons_livraison
       set statut     = 'signature_expiree',
           updated_at = now()
     where id = rec.bl_id
       and statut = 'signature_attendue';

    insert into public.notifications (user_id, type, title, body, bl_id, link, metadata)
    select bl.livreur_id, 'bl_signature_expired',
           'Signature expirée',
           'Le client n''a pas signé dans les 10 min — BL ' || bl.numero_bl,
           bl.id, '/bl/' || bl.id::text,
           jsonb_build_object('signature_id', rec.id, 'expired_at', now())
      from public.bons_livraison bl
     where bl.id = rec.bl_id and bl.livreur_id is not null;

    insert into public.notifications (user_id, type, title, body, bl_id, link, metadata)
    select bl.vendeur_id, 'bl_signature_expired',
           'Signature non reçue',
           'BL ' || bl.numero_bl || ' — réémission possible côté admin',
           bl.id, '/bl/' || bl.id::text,
           jsonb_build_object('signature_id', rec.id, 'expired_at', now())
      from public.bons_livraison bl
     where bl.id = rec.bl_id
       and bl.vendeur_id is not null
       and bl.vendeur_id is distinct from bl.livreur_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. invalidate_signature(p_bl_id, p_motif) — invalidation administrative
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.invalidate_signature(
  p_bl_id  uuid,
  p_motif  text default null
)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id  uuid := auth.uid();
  v_sig      public.signatures_electroniques%rowtype;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_admin_or_vendeur() then
    raise exception 'FORBIDDEN' using
      errcode = '42501',
      hint    = 'Seuls admin/vendeur peuvent invalider une signature.';
  end if;

  select * into v_sig from public.signatures_electroniques
   where bl_id = p_bl_id for update;
  if not found then
    raise exception 'SIGNATURE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_sig.statut = 'signe' then
    raise exception 'ALREADY_SIGNED_CANNOT_INVALIDATE' using
      errcode = 'P0001',
      hint    = 'Un BL signé est immuable (RG-236). Contacter l''admin pour audit log.';
  end if;

  update public.signatures_electroniques
     set statut          = 'expire',
         date_expiration = now()
   where id = v_sig.id;

  update public.bons_livraison
     set statut     = 'livre',
         updated_at = now()
   where id = p_bl_id
     and statut in ('signature_attendue','signature_expiree');

  insert into public.notifications (user_id, type, title, body, bl_id, link, metadata)
  select bl.livreur_id, 'bl_signature_expired',
         'Signature annulée',
         'L''admin a annulé la signature en cours' ||
           case when p_motif is not null then ' (motif : ' || p_motif || ')' else '' end,
         bl.id, '/bl/' || bl.id::text,
         jsonb_build_object(
           'signature_id',   v_sig.id,
           'invalidated_by', v_user_id,
           'motif',          p_motif
         )
    from public.bons_livraison bl
   where bl.id = p_bl_id and bl.livreur_id is not null;

  return json_build_object(
    'success',         true,
    'bl_id',           p_bl_id,
    'motif',           p_motif,
    'invalidated_at',  now(),
    'invalidated_by',  v_user_id
  );
end;
$$;

revoke all     on function public.invalidate_signature(uuid, text) from public;
grant  execute on function public.invalidate_signature(uuid, text) to authenticated;
