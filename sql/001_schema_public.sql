-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Schema Initial (schéma `public.*` unifié)
-- ════════════════════════════════════════════════════════════════════════════

-- Extensions (sécurisées et idempotentes)
create extension if not exists pgcrypto;       -- gen_random_uuid
create extension if not exists pg_trgm;        -- recherche floue clients
create extension if not exists btree_gist;     -- contraintes de plages horaires

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENUMs — Définis dans le schéma public
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.user_role as enum ('admin','vendeur','vendeur_proprietaire','livreur');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('en_attente','en_preparation','expediee','livree','annulee');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.bl_status as enum (
    'cree','assigne','confirme','release_demandee','bloque',
    'en_livraison','en_route','livre','signature_attendue','signe',
    'signature_expiree','echec_T1','echec_T2','abandon',
    'retour_planifie','retour_en_cours','retour_collecte'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.signature_status as enum ('en_attente','signe','expire');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.delivery_mode as enum ('domicile','retrait_magasin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.creneau_type as enum ('matin','apres_midi','soir');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.slot_status as enum ('disponible','reserve','termine','annule');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.vehicle_type as enum ('voiture','utilitaire','camionnette','camion');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attempt_failure_reason as enum (
    'client_absent','client_refuse','adresse_introuvable','articles_endommages',
    'colis_perdu','meteo','panne_vehicule','autre'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum (
    'bl_assigned','bl_creneau_confirmed','bl_release_requested','bl_release_validated',
    'bl_release_rejected','bl_delivered','bl_signed','bl_signature_expired',
    'bl_attempt_failed','system_alert'
  );
exception when duplicate_object then null; end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. profiles — Fiche utilisateur étendue à partir de auth.users
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id                       uuid                  primary key references auth.users(id) on delete cascade,
  nom                      text,
  prenom                   text,
  telephone                text,
  email                    text,
  role                     public.user_role      not null default 'vendeur',
  is_active                boolean               not null default true,
  vehicle_type             public.vehicle_type,
  vehicle_capacity_m3      numeric(5, 2),
  vehicle_immatriculation  text,
  weekly_schedule          jsonb                          default '{}'::jsonb,
  last_assigned_at         timestamptz,
  pin_hash                 text,
  preferred_language       text                           default 'fr'
                                                          check (preferred_language in ('fr','ar')),
  push_subscription        jsonb,
  zones_couvertes          text[],
  avatar_url               text,
  created_at               timestamptz           not null default now(),
  updated_at               timestamptz           not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. clients — Destinataires de livraisons (Shopify ou manuel)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id                   uuid          primary key default gen_random_uuid(),
  nom                  text          not null,
  prenom               text,
  email                text,
  telephone            text,
  adresse_ligne1       text          not null,
  adresse_ligne2       text,
  code_postal          text,
  ville                text,
  pays                 text                   default 'France',
  latitude             numeric(10, 7),
  longitude            numeric(10, 7),
  etage                int,
  ascenseur            boolean,
  code_porte           text,
  commentaire_acces    text,
  shopify_customer_id  text,
  anonymized_at        timestamptz,
  created_at           timestamptz   not null  default now(),
  updated_at           timestamptz   not null  default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. commandes — Commandes Shopify synchronisées
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.commandes (
  id                  uuid                  primary key default gen_random_uuid(),
  client_id           uuid                  not null references public.clients(id) on delete restrict,
  numero_commande     text                  not null unique,
  shopify_order_id    text                  unique,
  statut              public.order_status   not null default 'en_attente',
  montant_total_ttc   numeric(10, 2)        not null,
  montant_total_ht    numeric(10, 2),
  montant_tva         numeric(10, 2),
  taux_tva            numeric(4, 2)                   default 20.00,
  date_commande       timestamptz           not null default now(),
  notes               text,
  created_at          timestamptz           not null default now(),
  updated_at          timestamptz           not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. bons_livraison — Table pivot centrale
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.bons_livraison (
  id                          uuid                   primary key default gen_random_uuid(),
  numero_bl                   text                   not null unique,
  commande_id                 uuid                   not null references public.commandes(id) on delete restrict,
  client_id                   uuid                   not null references public.clients(id)   on delete restrict,
  vendeur_id                  uuid                            references public.profiles(id)   on delete set null,
  livreur_id                  uuid                            references public.profiles(id)   on delete set null,
  statut                      public.bl_status       not null default 'cree',
  mode_livraison              public.delivery_mode   not null default 'domicile',
  creneau                     public.creneau_type,
  date_livraison_prevue       date,
  date_livraison_effective    timestamptz,
  montant_total_ttc           numeric(10, 2)         not null,
  montant_frais_relivraison   numeric(10, 2)                  default 0,
  nb_tentatives               int                    not null default 0 check (nb_tentatives >= 0),
  admin_waiver                boolean                not null default false,
  attempt_log                 jsonb                  not null default '[]'::jsonb,
  assignment_log              jsonb                  not null default '[]'::jsonb,
  release_requested_at        timestamptz,
  release_validated_at        timestamptz,
  release_validated_by        uuid                            references public.profiles(id)   on delete set null,
  release_rejected_motif      text,
  photo_depart_url            text,
  vendeur_present_depart      boolean                         default true,
  photo_litige_url            text,
  pdf_url                     text,
  date_creation               timestamptz            not null default now(),
  date_signature              timestamptz,
  created_at                  timestamptz            not null default now(),
  updated_at                  timestamptz            not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. lignes_bl — Lignes de détail (Données Shopify dénormalisées)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.lignes_bl (
  id                  uuid            primary key default gen_random_uuid(),
  bl_id               uuid            not null references public.bons_livraison(id) on delete cascade,
  article_id          text,           -- ID d'article Shopify facultatif
  designation         text            not null,
  marque              text,
  modele              text,
  quantite            int             not null default 1 check (quantite > 0),
  prix_unitaire_ttc   numeric(10, 2)  not null,
  total_ligne_ttc     numeric(10, 2)  generated always as (quantite * prix_unitaire_ttc) stored,
  poids_kg            numeric(6, 2),
  volume_m3           numeric(6, 3),
  fragile             boolean                  default false,
  ordre_tri           int                      default 0,
  created_at          timestamptz     not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. creneaux_livraison — Plages horaires des livreurs
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.creneaux_livraison (
  id              uuid                  primary key default gen_random_uuid(),
  livreur_id      uuid                  not null references public.profiles(id) on delete cascade,
  date_creneau    date                  not null,
  type_creneau    public.creneau_type   not null,
  heure_debut     time                  not null,
  heure_fin       time                  not null,
  statut          public.slot_status    not null default 'disponible',
  bl_id           uuid                            references public.bons_livraison(id) on delete set null,
  notes           text,
  created_at      timestamptz           not null default now(),
  updated_at      timestamptz           not null default now(),
  constraint creneaux_unique_per_livreur unique (livreur_id, date_creneau, type_creneau)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. signatures_electroniques — Tokens de signature d'une validité de 10 min
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.signatures_electroniques (
  id                 uuid                       primary key default gen_random_uuid(),
  bl_id              uuid                       not null unique references public.bons_livraison(id) on delete cascade,
  token              text                       not null unique,
  email_client       text                       not null,
  statut             public.signature_status    not null default 'en_attente',
  signature_data     text,
  signature_png_url  text,
  signe_par_parent   boolean                             default false,
  parent_nom         text,
  parent_lien        text,
  client_ip          inet,
  user_agent         text,
  retry_count        int                        not null default 0,
  date_emission      timestamptz                not null default now(),
  date_expiration    timestamptz                not null,
  date_signature     timestamptz,
  constraint signatures_valid_expiration check (date_expiration > date_emission)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. driver_locations — Coordonnées GPS (conservation de 30 jours glissants)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.driver_locations (
  id           uuid           primary key default gen_random_uuid(),
  driver_id    uuid           not null references public.profiles(id) on delete cascade,
  bl_id        uuid                    references public.bons_livraison(id) on delete set null,
  lat          numeric(10, 7) not null  check (lat between -90 and 90),
  lng          numeric(10, 7) not null  check (lng between -180 and 180),
  accuracy_m   int,
  heading_deg  numeric(5, 2),
  speed_kmh    numeric(5, 2),
  recorded_at  timestamptz    not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. notifications — Flux in-app pour les utilisateurs
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid                       primary key default gen_random_uuid(),
  user_id     uuid                       not null references public.profiles(id) on delete cascade,
  type        public.notification_type   not null,
  title       text                       not null,
  body        text,
  link        text,
  bl_id       uuid                                references public.bons_livraison(id) on delete cascade,
  metadata    jsonb                               default '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz                not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 11. push_subscriptions — Abonnements aux notifications Web Push
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id            uuid         primary key default gen_random_uuid(),
  user_id       uuid         not null references public.profiles(id) on delete cascade,
  endpoint      text         not null unique,
  p256dh        text         not null,
  auth          text         not null,
  user_agent    text,
  device_label  text,
  is_active     boolean      not null default true,
  last_used_at  timestamptz,
  created_at    timestamptz  not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 12. bl_attempt_log — Logs des tentatives de livraison (KPIs / échecs)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.bl_attempt_log (
  id                 uuid                              primary key default gen_random_uuid(),
  bl_id              uuid                              not null references public.bons_livraison(id) on delete cascade,
  livreur_id         uuid                                       references public.profiles(id) on delete set null,
  numero_tentative   int                               not null,
  motif              public.attempt_failure_reason     not null,
  commentaire        text,
  photo_litige_url   text,
  latitude           numeric(10, 7),
  longitude          numeric(10, 7),
  recorded_at        timestamptz                       not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 13. bl_status_history — Historisation de tous les changements d'états
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.bl_status_history (
  id              uuid               primary key default gen_random_uuid(),
  bl_id           uuid               not null references public.bons_livraison(id) on delete cascade,
  ancien_statut   public.bl_status,
  nouveau_statut  public.bl_status   not null,
  triggered_by    uuid                        references public.profiles(id) on delete set null,
  trigger_source  text,
  metadata        jsonb                       default '{}'::jsonb,
  changed_at      timestamptz        not null default now()
);


-- ─────────────────────────────────────────────────────────────────────────────
-- 14. Droits d'accès par défaut pour le rôle anonyme et authentifié
-- ─────────────────────────────────────────────────────────────────────────────
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.clients,
  public.commandes,
  public.bons_livraison,
  public.lignes_bl,
  public.creneaux_livraison,
  public.signatures_electroniques,
  public.driver_locations,
  public.notifications,
  public.push_subscriptions,
  public.bl_attempt_log,
  public.bl_status_history
to authenticated;
