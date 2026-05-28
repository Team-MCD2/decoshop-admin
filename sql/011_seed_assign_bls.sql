-- ════════════════════════════════════════════════════════════════════════════
--  DECO SHOP — Assignation des BL aux Chauffeurs Seedes (Seed Data Update)
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_karim_id uuid;
  v_yassine_id uuid;
  v_mehdi_id uuid;
  v_omar_id uuid;
  
  rec record;
  i int := 0;
  v_drivers uuid[];
begin
  -- 1. Récupérer les UUIDs des chauffeurs à partir de leurs adresses mails
  select id into v_karim_id from public.profiles where email = 'karim@decoshop-toulouse.fr';
  select id into v_yassine_id from public.profiles where email = 'yassine@decoshop-toulouse.fr';
  select id into v_mehdi_id from public.profiles where email = 'mehdi@decoshop-toulouse.fr';
  select id into v_omar_id from public.profiles where email = 'omar@decoshop-toulouse.fr';

  -- S'assurer que tous ces chauffeurs sont bien marqués actifs pour l'auto-assignation et l'affichage
  update public.profiles 
     set is_active = true,
         weekly_schedule = '{"monday":["matin","apres_midi","soir"],"tuesday":["matin","apres_midi","soir"],"wednesday":["matin","apres_midi","soir"],"thursday":["matin","apres_midi","soir"],"friday":["matin","apres_midi","soir"],"saturday":["matin","apres_midi","soir"],"sunday":["matin","apres_midi","soir"]}'::jsonb
   where id in (v_karim_id, v_yassine_id, v_mehdi_id, v_omar_id);

  v_drivers := array[v_karim_id, v_yassine_id, v_mehdi_id, v_omar_id];

  -- 2. Répartir tous les BL non assignés (domicile) en round-robin entre les 4 livreurs
  for rec in 
    select id from public.bons_livraison where livreur_id is null and mode_livraison = 'domicile'
  loop
    update public.bons_livraison 
       set livreur_id = v_drivers[(i % 4) + 1],
           statut = 'assigne',
           -- Planifie sur aujourd'hui (0), demain (+1 jour) et après-demain (+2 jours)
           date_livraison_prevue = current_date + (i % 3) * interval '1 day',
           creneau = case (i % 3)
             when 0 then 'matin'::public.creneau_type
             when 1 then 'apres_midi'::public.creneau_type
             else 'soir'::public.creneau_type
           end
     where id = rec.id;
    i := i + 1;
  end loop;
  
  -- 3. Pour permettre de tester les badges de performance et la gamification immédiatement,
  -- nous marquons quelques BL comme signés pour Karim et Yassine pour leur donner un historique de performance de base !
  
  -- Karim : 12 BL signés (doit débloquer le badge Bronze !)
  i := 0;
  for rec in 
    select id from public.bons_livraison where livreur_id = v_karim_id limit 12
  loop
    update public.bons_livraison
       set statut = 'signe',
           date_livraison_effective = current_date - (i % 5) * interval '1 day',
           date_signature = current_date - (i % 5) * interval '1 day' + interval '2 minutes'
     where id = rec.id;
    i := i + 1;
  end loop;

  -- Yassine : 5 BL signés avec ponctualité à 100% (doit débloquer le badge Perfect Week !)
  i := 0;
  for rec in 
    select id from public.bons_livraison where livreur_id = v_yassine_id limit 5
  loop
    update public.bons_livraison
       set statut = 'signe',
           date_livraison_effective = current_date - (i % 3) * interval '1 day',
           date_signature = current_date - (i % 3) * interval '1 day' + interval '4 minutes'
     where id = rec.id;
    i := i + 1;
  end loop;

  -- 4. Lancer le calcul des snapshots de performance et l'attribution des badges
  perform public.calculate_driver_performance(v_karim_id, current_date);
  perform public.check_and_award_badges(v_karim_id);

  perform public.calculate_driver_performance(v_yassine_id, current_date);
  perform public.check_and_award_badges(v_yassine_id);

  perform public.calculate_driver_performance(v_mehdi_id, current_date);
  perform public.check_and_award_badges(v_mehdi_id);

  perform public.calculate_driver_performance(v_omar_id, current_date);
  perform public.check_and_award_badges(v_omar_id);

end $$;
