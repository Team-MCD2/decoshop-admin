-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Auto Assignment Triggers & Score Updates (schéma `public.*` unifié)
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Mettre à jour public.auto_assign_livreur pour utiliser la logique exacte
-- "pas de commandes en cours, ou le moins de commandes dans la semaine"
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
   order by 
     -- Règle A : Nombre de commandes "en cours" (minimiser)
     (
       select count(*)
         from public.bons_livraison b
        where b.livreur_id = p.id
          and b.statut in (
            'assigne','confirme','release_demandee','en_livraison','en_route',
            'signature_attendue','signature_expiree','echec_T1','echec_T2','retour_planifie','retour_en_cours'
          )
     ) asc,
     -- Règle B : Nombre de commandes assignées dans la semaine calendaire courante (minimiser)
     (
       select count(*)
         from public.bons_livraison b
        where b.livreur_id = p.id
          and b.created_at >= date_trunc('week', now())
     ) asc,
     -- Règle C : Récence d'assignation (favoriser le moins récemment assigné)
     coalesce(p.last_assigned_at, '1970-01-01'::timestamptz) asc,
     p.created_at asc
   limit 1;
   
  return v_livreur_id;
end;
$$;

revoke all     on function public.auto_assign_livreur(date) from public;
grant  execute on function public.auto_assign_livreur(date) to authenticated;


-- 2. Trigger AFTER INSERT OR UPDATE pour mettre à jour last_assigned_at ET envoyer la notification
create or replace function public.update_livreur_last_assigned()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.livreur_id is not null
     and (tg_op = 'INSERT' or old.livreur_id is null or old.livreur_id is distinct from new.livreur_id)
  then
    -- Mettre à jour last_assigned_at timestamp sur le profil
    update public.profiles
       set last_assigned_at = now()
     where id = new.livreur_id;

    -- Insérer une notification in-app pour le livreur
    insert into public.notifications (user_id, type, title, body, bl_id, link, metadata)
    values (
      new.livreur_id,
      'bl_assigned',
      'Nouveau bon de livraison',
      'Vous avez été assigné au bon de livraison ' || new.numero_bl,
      new.id,
      '/bl/' || new.id,
      jsonb_build_object('numero_bl', new.numero_bl, 'assigned_at', now())
    );
  end if;
  return new;
end;
$$;


-- 3. Trigger BEFORE INSERT pour l'affectation automatique d'un livreur si non spécifié (créations Shopify & manuelles)
create or replace function public.trg_auto_assign_bl()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_best_livreur_id uuid;
begin
  if new.mode_livraison = 'domicile'
     and new.livreur_id is null
     and new.statut = 'cree'
  then
    -- Trouver le meilleur livreur disponible
    v_best_livreur_id := public.auto_assign_livreur(coalesce(new.date_livraison_prevue, current_date));
    
    if v_best_livreur_id is not null then
      new.livreur_id := v_best_livreur_id;
      new.statut     := 'assigne';
      new.assignment_log := coalesce(new.assignment_log, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'type', 'auto_assignment',
          'livreur_id', v_best_livreur_id,
          'timestamp', now()
        )
      );
    end if;
  elsif new.livreur_id is not null and new.statut = 'cree' then
    -- Si un livreur est affecté manuellement à la création, passer le statut en 'assigne'
    new.statut := 'assigne';
    new.assignment_log := coalesce(new.assignment_log, '[]'::jsonb) || jsonb_build_array(
      jsonb_build_object(
        'type', 'manual_assignment',
        'livreur_id', new.livreur_id,
        'timestamp', now()
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auto_assign_bl on public.bons_livraison;
create trigger trg_auto_assign_bl
  before insert on public.bons_livraison
  for each row execute function public.trg_auto_assign_bl();


-- 4. Trigger BEFORE UPDATE pour journaliser les changements d'affectations et ajuster les statuts
create or replace function public.trg_bl_assignment_log()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.livreur_id is distinct from old.livreur_id then
    if new.livreur_id is not null then
      new.assignment_log := coalesce(new.assignment_log, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'type', 'manual_assignment',
          'livreur_id', new.livreur_id,
          'old_livreur_id', old.livreur_id,
          'timestamp', now()
        )
      );
      -- Si le BL était 'cree', passer en 'assigne'
      if new.statut = 'cree' then
        new.statut := 'assigne';
      end if;
    else
      new.assignment_log := coalesce(new.assignment_log, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
          'type', 'unassignment',
          'old_livreur_id', old.livreur_id,
          'timestamp', now()
        )
      );
      -- Si le BL était 'assigne', repasser en 'cree'
      if new.statut = 'assigne' then
        new.statut := 'cree';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bl_assignment_log on public.bons_livraison;
create trigger trg_bl_assignment_log
  before update of livreur_id on public.bons_livraison
  for each row execute function public.trg_bl_assignment_log();


-- 5. Enregistrer la migration
create table if not exists public._migrations (
  filename     text         primary key,
  app          text         not null,
  applied_at   timestamptz  not null default now(),
  checksum     text
);

insert into public._migrations (filename, app, checksum)
values ('009_auto_assignment_triggers.sql', 'livreur', null)
on conflict (filename) do nothing;
