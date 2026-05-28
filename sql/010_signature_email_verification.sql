-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Verification de l'Email Client lors de la Signature (schéma `public.*`)
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Supprimer l'ancienne version de la fonction pour éviter les conflits de signature (nombre de paramètres)
drop function if exists public.submit_signature(text, text, boolean, text, text, text);

-- 2. Recréer la fonction avec le paramètre p_email_client
create or replace function public.submit_signature(
  p_token             text,
  p_signature_data    text,
  p_email_client      text, -- Paramètre obligatoire pour vérifier l'identité du signataire
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
  if p_email_client is null or length(trim(p_email_client)) = 0 then
    raise exception 'EMAIL_REQUIRED' using errcode = '22023', hint = 'L''adresse email est obligatoire pour valider la signature.';
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

  -- Validation de l'email : doit correspondre (insensible à la casse, espaces nettoyés)
  if lower(trim(p_email_client)) is distinct from lower(trim(v_sig.email_client)) then
    raise exception 'EMAIL_MISMATCH' using
      errcode = '22023',
      hint    = 'L''adresse email de vérification ne correspond pas à celle enregistrée pour cette livraison.';
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

revoke all     on function public.submit_signature(text, text, text, boolean, text, text, text) from public;
grant  execute on function public.submit_signature(text, text, text, boolean, text, text, text) to anon, authenticated;

-- 3. Enregistrer la migration
create table if not exists public._migrations (
  filename     text         primary key,
  app          text         not null,
  applied_at   timestamptz  not null default now(),
  checksum     text
);

insert into public._migrations (filename, app, checksum)
values ('010_signature_email_verification.sql', 'livreur', null)
on conflict (filename) do nothing;
