-- ============================================================
-- 014_optimized_views.sql — Optimization Views for DecoShop
-- ============================================================
-- Ce script crée la vue public.v_commandes_sans_bl qui permet de
-- lister de façon performante les commandes locales sans BL associé.

CREATE OR REPLACE VIEW public.v_commandes_sans_bl AS
SELECT 
  c.id, 
  c.shopify_order_id, 
  c.numero_commande, 
  c.montant_total_ttc, 
  c.date_commande, 
  c.client_id
FROM public.commandes c
LEFT JOIN public.bons_livraison bl ON bl.commande_id = c.id
WHERE bl.id IS NULL;

-- Accorder les permissions de lecture aux utilisateurs authentifiés
GRANT SELECT ON public.v_commandes_sans_bl TO authenticated;
GRANT SELECT ON public.v_commandes_sans_bl TO service_role;
