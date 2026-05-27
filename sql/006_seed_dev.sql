SET search_path = public, extensions, auth;

DO $$
DECLARE
  -- Drivers / owner dynamic UUIDs (resolved dynamically by email)
  v_karim_id    uuid;
  v_yassine_id  uuid;
  v_mehdi_id    uuid;
  v_omar_id     uuid;
  v_fayssal_id  uuid;

  -- Clients / commandes / BL : UUIDs déterministes pour idempotence
  v_client1_id  uuid := '66666666-6666-6666-6666-666666666601';
  v_client2_id  uuid := '66666666-6666-6666-6666-666666666602';
  v_client3_id  uuid := '66666666-6666-6666-6666-666666666603';
  v_client4_id  uuid := '66666666-6666-6666-6666-666666666604';
  v_client5_id  uuid := '66666666-6666-6666-6666-666666666605';
  v_cmd1_id     uuid := '77777777-7777-7777-7777-777777777701';
  v_cmd2_id     uuid := '77777777-7777-7777-7777-777777777702';
  v_cmd3_id     uuid := '77777777-7777-7777-7777-777777777703';
  v_cmd4_id     uuid := '77777777-7777-7777-7777-777777777704';
  v_cmd5_id     uuid := '77777777-7777-7777-7777-777777777705';
  v_bl1_id      uuid := '88888888-8888-8888-8888-888888888801';
  v_bl2_id      uuid := '88888888-8888-8888-8888-888888888802';
  v_bl3_id      uuid := '88888888-8888-8888-8888-888888888803';
  v_bl4_id      uuid := '88888888-8888-8888-8888-888888888804';
  v_bl5_id      uuid := '88888888-8888-8888-8888-888888888805';

  -- ─── Résolution dynamique des UUIDs Auth (par email) ──────────────────────
BEGIN
  SELECT id INTO v_karim_id   FROM auth.users WHERE email = 'karim@decoshop-toulouse.fr';
  SELECT id INTO v_yassine_id FROM auth.users WHERE email = 'yassine@decoshop-toulouse.fr';
  SELECT id INTO v_mehdi_id   FROM auth.users WHERE email = 'mehdi@decoshop-toulouse.fr';
  SELECT id INTO v_omar_id    FROM auth.users WHERE email = 'omar@decoshop-toulouse.fr';
  SELECT id INTO v_fayssal_id FROM auth.users WHERE email = 'fayssal@decoshop-toulouse.fr';

  IF v_karim_id IS NULL OR v_yassine_id IS NULL OR v_mehdi_id IS NULL OR v_omar_id IS NULL OR v_fayssal_id IS NULL THEN
    RAISE EXCEPTION 'Certains comptes auth.users sont manquants. Veuillez lancer d''abord: node sql/seed-users.mjs';
  END IF;

  -- ─── 0) Nettoyage des anciennes données (cascade activé) ───────────────────
  -- Pour éviter toute violation de contrainte de clé étrangère lors d'un re-seed,
  -- nous supprimons les données dans l'ordre inverse des dépendances.

  -- 0.1) Positions GPS
  DELETE FROM public.driver_locations 
  WHERE driver_id IN (v_karim_id, v_yassine_id, v_mehdi_id, v_omar_id, v_fayssal_id)
     OR bl_id IN (v_bl1_id, v_bl2_id, v_bl3_id, v_bl4_id, v_bl5_id);

  -- 0.2) Notifications
  DELETE FROM public.notifications 
  WHERE user_id IN (v_karim_id, v_yassine_id, v_mehdi_id, v_omar_id, v_fayssal_id)
     OR bl_id IN (v_bl1_id, v_bl2_id, v_bl3_id, v_bl4_id, v_bl5_id);

  -- 0.3) Abonnements Web Push
  DELETE FROM public.push_subscriptions 
  WHERE user_id IN (v_karim_id, v_yassine_id, v_mehdi_id, v_omar_id, v_fayssal_id);

  -- 0.4) Logs des tentatives et d'états
  DELETE FROM public.bl_attempt_log WHERE bl_id IN (v_bl1_id, v_bl2_id, v_bl3_id, v_bl4_id, v_bl5_id);
  DELETE FROM public.bl_status_history WHERE bl_id IN (v_bl1_id, v_bl2_id, v_bl3_id, v_bl4_id, v_bl5_id);

  -- 0.5) Signatures électroniques
  DELETE FROM public.signatures_electroniques WHERE bl_id IN (v_bl1_id, v_bl2_id, v_bl3_id, v_bl4_id, v_bl5_id);

  -- 0.6) Créneaux de livraison
  DELETE FROM public.creneaux_livraison 
  WHERE bl_id IN (v_bl1_id, v_bl2_id, v_bl3_id, v_bl4_id, v_bl5_id)
     OR livreur_id IN (v_karim_id, v_yassine_id, v_mehdi_id, v_omar_id, v_fayssal_id);

  -- 0.7) Lignes de BL
  DELETE FROM public.lignes_bl WHERE bl_id IN (v_bl1_id, v_bl2_id, v_bl3_id, v_bl4_id, v_bl5_id);

  -- 0.8) Bons de livraison
  DELETE FROM public.bons_livraison WHERE id IN (v_bl1_id, v_bl2_id, v_bl3_id, v_bl4_id, v_bl5_id);

  -- 0.9) Commandes
  DELETE FROM public.commandes WHERE id IN (v_cmd1_id, v_cmd2_id, v_cmd3_id, v_cmd4_id, v_cmd5_id);

  -- 0.10) Clients
  DELETE FROM public.clients WHERE id IN (v_client1_id, v_client2_id, v_client3_id, v_client4_id, v_client5_id);

  -- ─── 2) Configuration finale des profiles ──────────────────────────────────
  -- We use INSERT ... ON CONFLICT to make sure they exist even if trigger didn't run.
  
  INSERT INTO public.profiles (
    id, email, nom, prenom, telephone, role, is_active, vehicle_type,
    vehicle_capacity_m3, vehicle_immatriculation, weekly_schedule, zones_couvertes
  ) VALUES (
    v_karim_id, 'karim@decoshop-toulouse.fr', 'BENALI', 'Karim', '+33 6 00 00 00 01',
    'livreur'::public.user_role, true, 'utilitaire'::public.vehicle_type,
    8.0, 'AB-123-CD',
    '{"monday":["matin","apres_midi"],"tuesday":["matin","apres_midi","soir"],"wednesday":["matin","apres_midi"],"thursday":["matin","apres_midi","soir"],"friday":["matin","apres_midi","soir"],"saturday":["matin","apres_midi"]}'::jsonb,
    array['Toulouse Centre','Rangueil','Côte Pavée','Empalot']
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    nom = excluded.nom,
    prenom = excluded.prenom,
    telephone = excluded.telephone,
    role = excluded.role,
    is_active = excluded.is_active,
    vehicle_type = excluded.vehicle_type,
    vehicle_capacity_m3 = excluded.vehicle_capacity_m3,
    vehicle_immatriculation = excluded.vehicle_immatriculation,
    weekly_schedule = excluded.weekly_schedule,
    zones_couvertes = excluded.zones_couvertes,
    updated_at = now();

  INSERT INTO public.profiles (
    id, email, nom, prenom, telephone, role, is_active, vehicle_type,
    vehicle_capacity_m3, vehicle_immatriculation, weekly_schedule, zones_couvertes
  ) VALUES (
    v_yassine_id, 'yassine@decoshop-toulouse.fr', 'EL AMRANI', 'Yassine', '+33 6 00 00 00 02',
    'livreur'::public.user_role, true, 'camionnette'::public.vehicle_type,
    14.0, 'EF-456-GH',
    '{"monday":["matin","apres_midi","soir"],"tuesday":["matin","apres_midi"],"wednesday":["matin","apres_midi","soir"],"thursday":["matin","apres_midi"],"friday":["matin","apres_midi"],"saturday":["matin","apres_midi","soir"]}'::jsonb,
    array['Blagnac','Colomiers','Tournefeuille','Toulouse Ouest']
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    nom = excluded.nom,
    prenom = excluded.prenom,
    telephone = excluded.telephone,
    role = excluded.role,
    is_active = excluded.is_active,
    vehicle_type = excluded.vehicle_type,
    vehicle_capacity_m3 = excluded.vehicle_capacity_m3,
    vehicle_immatriculation = excluded.vehicle_immatriculation,
    weekly_schedule = excluded.weekly_schedule,
    zones_couvertes = excluded.zones_couvertes,
    updated_at = now();

  INSERT INTO public.profiles (
    id, email, nom, prenom, telephone, role, is_active, vehicle_type,
    vehicle_capacity_m3, vehicle_immatriculation, weekly_schedule, zones_couvertes
  ) VALUES (
    v_mehdi_id, 'mehdi@decoshop-toulouse.fr', 'ZAHIDI', 'Mehdi', '+33 6 00 00 00 03',
    'livreur'::public.user_role, true, 'voiture'::public.vehicle_type,
    3.0, 'IJ-789-KL',
    '{"tuesday":["apres_midi","soir"],"wednesday":["matin","apres_midi","soir"],"thursday":["matin","apres_midi","soir"],"friday":["apres_midi","soir"],"saturday":["matin","apres_midi","soir"]}'::jsonb,
    array['Saint-Orens','Balma','Toulouse Est']
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    nom = excluded.nom,
    prenom = excluded.prenom,
    telephone = excluded.telephone,
    role = excluded.role,
    is_active = excluded.is_active,
    vehicle_type = excluded.vehicle_type,
    vehicle_capacity_m3 = excluded.vehicle_capacity_m3,
    vehicle_immatriculation = excluded.vehicle_immatriculation,
    weekly_schedule = excluded.weekly_schedule,
    zones_couvertes = excluded.zones_couvertes,
    updated_at = now();

  INSERT INTO public.profiles (
    id, email, nom, prenom, telephone, role, is_active, vehicle_type,
    vehicle_capacity_m3, vehicle_immatriculation, weekly_schedule, zones_couvertes
  ) VALUES (
    v_omar_id, 'omar@decoshop-toulouse.fr', 'CHAKIR', 'Omar', '+33 6 00 00 00 04',
    'livreur'::public.user_role, false, 'voiture'::public.vehicle_type,
    3.0, 'MN-012-OP',
    '{}'::jsonb,
    array[]::text[]
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    nom = excluded.nom,
    prenom = excluded.prenom,
    telephone = excluded.telephone,
    role = excluded.role,
    is_active = excluded.is_active,
    vehicle_type = excluded.vehicle_type,
    vehicle_capacity_m3 = excluded.vehicle_capacity_m3,
    vehicle_immatriculation = excluded.vehicle_immatriculation,
    weekly_schedule = excluded.weekly_schedule,
    zones_couvertes = excluded.zones_couvertes,
    updated_at = now();

  INSERT INTO public.profiles (
    id, email, nom, prenom, telephone, role, is_active, weekly_schedule
  ) VALUES (
    v_fayssal_id, 'fayssal@decoshop-toulouse.fr', 'BOUSSATTA', 'Fayssal', '+33 7 67 27 86 25',
    'vendeur_proprietaire'::public.user_role, true, '{}'::jsonb
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    nom = excluded.nom,
    prenom = excluded.prenom,
    telephone = excluded.telephone,
    role = excluded.role,
    is_active = excluded.is_active,
    weekly_schedule = excluded.weekly_schedule,
    updated_at = now();

  -- ─── 3) clients (Toulouse + alentours) ────────────────────────────────────
  INSERT INTO public.clients (
    id, nom, prenom, email, telephone,
    adresse_ligne1, code_postal, ville, pays,
    latitude, longitude, etage, ascenseur, code_porte, commentaire_acces
  ) VALUES
  (v_client1_id, 'Dupont', 'Marie', 'marie.dupont@example.com', '+33 6 12 34 56 78',
   '12 Rue Bayard', '31000', 'Toulouse', 'France',
   43.6080, 1.4475, 3, true, '1234',
   'Sonner à droite, M. Dupont au bureau jusqu''à 18h'),
  (v_client2_id, 'El Khalid', 'Aïcha', 'aicha.elkhalid@example.com', '+33 6 23 45 67 89',
   '5 Avenue Jean Jaurès', '31000', 'Toulouse', 'France',
   43.6045, 1.4518, 1, false, null,
   'Pavillon avec portail vert, sonner à l''interphone'),
  (v_client3_id, 'Martin', 'Jean-Pierre', 'jp.martin@example.com', '+33 6 34 56 78 90',
   '24 Boulevard de Suisse', '31200', 'Toulouse', 'France',
   43.6235, 1.4360, 5, true, '7890',
   'Bâtiment B, ascenseur en panne signalé hier — appeler avant arrivée'),
  (v_client4_id, 'Bouchareb', 'Karim', 'karim.bouchareb@example.com', '+33 6 45 67 89 01',
   '8 Place du Capitole', '31000', 'Toulouse', 'France',
   43.6045, 1.4440, 2, true, '4567',
   'Stationnement difficile centre-ville, prévoir 5 min de marche'),
  (v_client5_id, 'Garcia', 'Sophia', 'sophia.garcia@example.com', '+33 6 56 78 90 12',
   '17 Rue des Lilas', '31700', 'Blagnac', 'France',
   43.6358, 1.3900, 0, false, null,
   'Maison individuelle, garage devant, bien placer le véhicule');

  -- ─── 4) commandes (Shopify simulées) ──────────────────────────────────────
  INSERT INTO public.commandes (
    id, client_id, numero_commande, shopify_order_id, statut,
    montant_total_ttc, montant_total_ht, taux_tva, montant_tva, date_commande
  ) VALUES
  (v_cmd1_id, v_client1_id, 'DECO-CMD-260425-001', 'shopify-1001', 'en_preparation',
   899.00, 749.17, 20.00, 149.83, '2026-04-25 14:30:00+02'),
  (v_cmd2_id, v_client2_id, 'DECO-CMD-260425-002', 'shopify-1002', 'en_preparation',
   1450.00, 1208.33, 20.00, 241.67, '2026-04-25 16:45:00+02'),
  (v_cmd3_id, v_client3_id, 'DECO-CMD-260426-003', 'shopify-1003', 'en_preparation',
   329.00, 274.17, 20.00, 54.83, '2026-04-26 10:15:00+02'),
  (v_cmd4_id, v_client4_id, 'DECO-CMD-260426-004', 'shopify-1004', 'expediee',
   549.00, 457.50, 20.00, 91.50, '2026-04-26 11:20:00+02'),
  (v_cmd5_id, v_client5_id, 'DECO-CMD-260426-005', 'shopify-1005', 'expediee',
   2199.00, 1832.50, 20.00, 366.50, '2026-04-26 12:00:00+02');

  -- ─── 5) bons_livraison (variété de statuts) ───────────────────────────────
  INSERT INTO public.bons_livraison (
    id, numero_bl, commande_id, client_id, vendeur_id, livreur_id,
    statut, mode_livraison, creneau, date_livraison_prevue,
    montant_total_ttc, nb_tentatives, vendeur_present_depart
  ) VALUES
  -- BL 1 : confirmé pour aujourd'hui matin (Karim)
  (v_bl1_id, 'DECO-BL-260427-0001', v_cmd1_id, v_client1_id, v_fayssal_id, v_karim_id,
   'confirme', 'domicile', 'matin', CURRENT_DATE, 899.00, 0, true),
  -- BL 2 : assigné à Yassine, créneau pas encore choisi
  (v_bl2_id, 'DECO-BL-260427-0002', v_cmd2_id, v_client2_id, v_fayssal_id, v_yassine_id,
   'assigne', 'domicile', null, null, 1450.00, 0, true),
  -- BL 3 : en cours de livraison (Mehdi)
  (v_bl3_id, 'DECO-BL-260427-0003', v_cmd3_id, v_client3_id, v_fayssal_id, v_mehdi_id,
   'en_route', 'domicile', 'apres_midi', CURRENT_DATE, 329.00, 0, true),
  -- BL 4 : déjà livré et signé (Karim, hier)
  (v_bl4_id, 'DECO-BL-260426-0004', v_cmd4_id, v_client4_id, v_fayssal_id, v_karim_id,
   'signe', 'domicile', 'apres_midi', CURRENT_DATE - 1, 549.00, 0, true),
  -- BL 5 : tentative 1 échouée → re-planifié
  (v_bl5_id, 'DECO-BL-260427-0005', v_cmd5_id, v_client5_id, v_fayssal_id, v_yassine_id,
   'echec_T1', 'domicile', 'matin', CURRENT_DATE, 2199.00, 1, true);

  -- ─── 6) lignes_bl (articles) ──────────────────────────────────────────────
  INSERT INTO public.lignes_bl (
    bl_id, designation, marque, modele, quantite, prix_unitaire_ttc,
    poids_kg, volume_m3, fragile, ordre_tri
  ) VALUES
  (v_bl1_id, 'Canapé Linen 3 places',         'DecoShop', 'CAN-LIN-3P-NAVY',  1,  899.00, 65.0, 2.40, false, 1),
  (v_bl2_id, 'Tapis berbère 200×300 cm',      'DecoShop', 'TAP-BER-200x300',  1, 1290.00, 12.0, 0.30, false, 1),
  (v_bl2_id, 'Lanterne marocaine XL dorée',   'DecoShop', 'LAN-MOR-XL-OR',    2,   80.00,  1.5, 0.10, true,  2),
  (v_bl3_id, 'Voilage brodé 140×260 cm',      'DecoShop', 'VOI-BROD-140x260', 1,   89.00,  0.8, 0.05, false, 1),
  (v_bl3_id, 'Service à thé 6 verres dorés',  'DecoShop', 'SVC-THE-6-OR',     1,  240.00,  2.5, 0.10, true,  2),
  (v_bl4_id, 'Pouf en cuir camel',            'DecoShop', 'POUF-CUIR-CAM',    2,  159.00,  8.0, 0.40, false, 1),
  (v_bl4_id, 'Miroir soleil 80 cm doré',      'DecoShop', 'MIR-SOL-80-OR',    1,  231.00,  4.0, 0.20, true,  2),
  (v_bl5_id, 'Canapé angle convertible Beni', 'DecoShop', 'CAN-ANG-BENI',     1, 2199.00, 95.0, 3.80, false, 1);

  -- ─── 7) creneaux_livraison (semaine en cours) ─────────────────────────────
  -- note: heure_debut / heure_fin sont auto-remplies par le trigger `set_creneau_heures`
  INSERT INTO public.creneaux_livraison (livreur_id, date_creneau, type_creneau, statut, bl_id) VALUES
  -- Aujourd'hui
  (v_karim_id,   CURRENT_DATE,     'matin',      'reserve'::public.slot_status,    v_bl1_id),
  (v_karim_id,   CURRENT_DATE,     'apres_midi', 'disponible'::public.slot_status, null),
  (v_karim_id,   CURRENT_DATE,     'soir',       'disponible'::public.slot_status, null),
  (v_yassine_id, CURRENT_DATE,     'matin',      'reserve'::public.slot_status,    v_bl5_id),
  (v_yassine_id, CURRENT_DATE,     'apres_midi', 'disponible'::public.slot_status, null),
  (v_mehdi_id,   CURRENT_DATE,     'apres_midi', 'reserve'::public.slot_status,    v_bl3_id),
  (v_mehdi_id,   CURRENT_DATE,     'soir',       'disponible'::public.slot_status, null),
  -- Demain (planning)
  (v_karim_id,   CURRENT_DATE + 1, 'matin',      'disponible'::public.slot_status, null),
  (v_karim_id,   CURRENT_DATE + 1, 'apres_midi', 'disponible'::public.slot_status, null),
  (v_yassine_id, CURRENT_DATE + 1, 'matin',      'disponible'::public.slot_status, null),
  (v_yassine_id, CURRENT_DATE + 1, 'apres_midi', 'disponible'::public.slot_status, null),
  (v_mehdi_id,   CURRENT_DATE + 1, 'matin',      'disponible'::public.slot_status, null)
  ON CONFLICT (livreur_id, date_creneau, type_creneau) DO NOTHING;

  -- ─── 8) notifications mock (in-app feed) ──────────────────────────────────
  INSERT INTO public.notifications (user_id, type, title, body, link, bl_id) VALUES
  (v_karim_id,   'bl_assigned'::public.notification_type, 'Nouveau BL assigné',
   'M. Dupont · 12 Rue Bayard · Canapé 3 places', '/bl/' || v_bl1_id, v_bl1_id),
  (v_yassine_id, 'bl_assigned'::public.notification_type, 'Nouveau BL assigné',
   'Mme El Khalid · 5 Av Jean Jaurès · 2 articles', '/bl/' || v_bl2_id, v_bl2_id),
  (v_mehdi_id,   'bl_release_validated'::public.notification_type, 'BL débloqué par Fayssal',
   'Tu peux démarrer la livraison', '/bl/' || v_bl3_id, v_bl3_id);

  -- ─── 9) signature mock (BL 4 = signé) ─────────────────────────────────────
  INSERT INTO public.signatures_electroniques (
    bl_id, token, email_client, statut,
    signature_data, date_emission, date_expiration, date_signature, signe_par_parent
  ) VALUES (
    v_bl4_id, 'mock-jwt-' || gen_random_uuid()::text,
    'karim.bouchareb@example.com', 'signe'::public.signature_status,
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    now() - interval '1 day' - interval '5 minutes',
    now() - interval '1 day' + interval '5 minutes',
    now() - interval '1 day', false
  )
  ON CONFLICT (bl_id) DO NOTHING;

  -- ─── 10) tentative log (BL 5 = échec T1) ───────────────────────────────────
  INSERT INTO public.bl_attempt_log (bl_id, livreur_id, numero_tentative, motif, commentaire) VALUES
  (v_bl5_id, v_yassine_id, 1, 'client_absent'::public.attempt_failure_reason,
   'Sonné 3 fois, appelé téléphone — pas de réponse. Voisin non disponible. Re-planifié.');

  -- ─── 11) Correction des champs tokens NULL dans auth.users ─────────────────
  -- GoTrue plante avec une erreur 500 ("converting NULL to string is unsupported")
  -- si ces colonnes contiennent NULL pour un utilisateur existant.
  UPDATE auth.users
  SET 
    confirmation_token = COALESCE(confirmation_token, ''),
    recovery_token = COALESCE(recovery_token, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    email_change = COALESCE(email_change, ''),
    phone_change = COALESCE(phone_change, ''),
    phone_change_token = COALESCE(phone_change_token, ''),
    email_change_token_current = COALESCE(email_change_token_current, ''),
    reauthentication_token = COALESCE(reauthentication_token, '');

  RAISE NOTICE '✅ Seed dev terminé avec succès.';
END $$;
