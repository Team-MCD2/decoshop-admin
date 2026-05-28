-- ============================================================
-- SQL CLEANUP SCRIPT — DecoShop Production Reset
-- ============================================================
-- Ce script nettoie toutes les données de test et de simulation
-- pour laisser place aux vraies synchronisations Shopify.
-- Executez ce script dans l'éditeur SQL de votre console Supabase.

BEGIN;

-- 1. Désactiver temporairement les triggers pour éviter les effets de bord
ALTER TABLE public.bons_livraison DISABLE TRIGGER ALL;
ALTER TABLE public.commandes DISABLE TRIGGER ALL;

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

-- 3. Nettoyer les profils ayant le rôle de livreur pour repartir à zéro
DELETE FROM public.profiles WHERE role = 'livreur';

-- 4. Réactiver les triggers
ALTER TABLE public.bons_livraison ENABLE TRIGGER ALL;
ALTER TABLE public.commandes ENABLE TRIGGER ALL;

COMMIT;

-- Note : Vous pouvez également nettoyer les utilisateurs authentifiés dans Supabase Auth
-- via l'interface Supabase (onglet Authentication -> Users) en supprimant les emails de test
-- pour pouvoir ré-inviter les vrais chauffeurs proprement.
