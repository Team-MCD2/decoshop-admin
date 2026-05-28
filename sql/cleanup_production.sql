-- ============================================================================
-- SQL CLEANUP SCRIPT — DecoShop Production Reset & Auth Wipe
-- ============================================================================
-- Ce script nettoie TOUTES les données de test, de simulation et d'authentification
-- pour laisser place aux vraies synchronisations Shopify et aux vrais chauffeurs.
-- Executez ce script dans l'éditeur SQL de votre console Supabase.

BEGIN;

-- 1. Désactiver temporairement les triggers utilisateurs pour éviter les effets de bord
ALTER TABLE public.bons_livraison DISABLE TRIGGER USER;
ALTER TABLE public.commandes DISABLE TRIGGER USER;

-- 2. Vider les tables opérationnelles avec cascade
TRUNCATE TABLE public.driver_locations CASCADE;
TRUNCATE TABLE public.driver_badges CASCADE;
TRUNCATE TABLE public.driver_performance_snapshots CASCADE;
TRUNCATE TABLE public.notifications CASCADE;
TRUNCATE TABLE public.creneaux_livraison CASCADE;
TRUNCATE TABLE public.lignes_bl CASCADE;
TRUNCATE TABLE public.bons_livraison CASCADE;
TRUNCATE TABLE public.commandes CASCADE;
TRUNCATE TABLE public.clients CASCADE;
TRUNCATE TABLE public.bl_status_history CASCADE;
TRUNCATE TABLE public.bl_attempt_log CASCADE;

-- 3. Nettoyer les profils ayant le rôle de livreur ou de test
DELETE FROM public.profiles WHERE role = 'livreur';
DELETE FROM public.profiles WHERE email IN (
  'karim@decoshop-toulouse.fr',
  'yassine@decoshop-toulouse.fr',
  'mehdi@decoshop-toulouse.fr',
  'omar@decoshop-toulouse.fr'
);

-- 4. Nettoyer les utilisateurs authentifiés dans Supabase Auth (schéma interne)
DELETE FROM auth.identities 
WHERE user_id IN (
  'aaaaaaaa-1111-1111-1111-111111111111'::uuid,
  'bbbbbbbb-2222-2222-2222-222222222222'::uuid,
  'cccccccc-3333-3333-3333-333333333333'::uuid,
  'dddddddd-4444-4444-4444-444444444444'::uuid
);

DELETE FROM auth.users 
WHERE id IN (
  'aaaaaaaa-1111-1111-1111-111111111111'::uuid,
  'bbbbbbbb-2222-2222-2222-222222222222'::uuid,
  'cccccccc-3333-3333-3333-333333333333'::uuid,
  'dddddddd-4444-4444-4444-444444444444'::uuid
);

DELETE FROM auth.identities WHERE provider_id IN (
  'karim@decoshop-toulouse.fr',
  'yassine@decoshop-toulouse.fr',
  'mehdi@decoshop-toulouse.fr',
  'omar@decoshop-toulouse.fr'
);

DELETE FROM auth.users WHERE email IN (
  'karim@decoshop-toulouse.fr',
  'yassine@decoshop-toulouse.fr',
  'mehdi@decoshop-toulouse.fr',
  'omar@decoshop-toulouse.fr'
);

-- 5. Réactiver les triggers
ALTER TABLE public.bons_livraison ENABLE TRIGGER USER;
ALTER TABLE public.commandes ENABLE TRIGGER USER;

COMMIT;

-- Le nettoyage est terminé. La base est prête pour de vrais imports de production !
