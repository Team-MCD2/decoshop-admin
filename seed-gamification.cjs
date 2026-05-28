const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://syedoeskfykwedfhbpmm.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5ZWRvZXNrZnlrd2VkZmhicG1tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgyMTUzNCwiZXhwIjoyMDk1Mzk3NTM0fQ.Q3mEgpCFQYP8jL2NzAC7NeTA_oWIlCcKxKO9hscFf9k';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

const DRIVERS = {
  karim: '1bf56c77-4091-4501-b3d0-6827053ddc48',
  yassine: '0aac42df-9581-47c9-8a71-b6870e45bd46',
  mehdi: '60e9441b-3197-4516-a004-5bceaa4e6df5',
  omar: '343c0696-fafe-467f-bcae-e35f75ab4a6a'
};

async function main() {
  console.log('🚀 Seeding Gamification and Workload Data...');

  // 1. Activate all drivers and set schedules
  const scheduleJson = {
    monday: ['matin', 'apres_midi', 'soir'],
    tuesday: ['matin', 'apres_midi', 'soir'],
    wednesday: ['matin', 'apres_midi', 'soir'],
    thursday: ['matin', 'apres_midi', 'soir'],
    friday: ['matin', 'apres_midi', 'soir'],
    saturday: ['matin', 'apres_midi', 'soir'],
    sunday: ['matin', 'apres_midi', 'soir']
  };

  const driverIds = Object.values(DRIVERS);
  const { error: errActivate } = await supabase
    .from('profiles')
    .update({
      is_active: true,
      weekly_schedule: scheduleJson
    })
    .in('id', driverIds);

  if (errActivate) {
    console.error('Error activating drivers:', errActivate);
    return;
  }
  console.log('✅ Drivers activated and schedules set.');

  // 2. Clean up previous gamification test data
  // We'll delete lines, BLs, orders, and clients with 'GAM-' prefix
  const { data: oldClients } = await supabase
    .from('clients')
    .select('id')
    .like('nom', 'GAM-%');

  if (oldClients && oldClients.length > 0) {
    const oldClientIds = oldClients.map(c => c.id);
    
    // Cascades should handle this, but let's do it safely
    const { data: oldOrders } = await supabase
      .from('commandes')
      .select('id')
      .in('client_id', oldClientIds);
    
    if (oldOrders && oldOrders.length > 0) {
      const oldOrderIds = oldOrders.map(o => o.id);
      
      const { data: oldBLs } = await supabase
        .from('bons_livraison')
        .select('id')
        .in('commande_id', oldOrderIds);

      if (oldBLs && oldBLs.length > 0) {
        const oldBlIds = oldBLs.map(b => b.id);
        await supabase.from('signatures_electroniques').delete().in('bl_id', oldBlIds);
        await supabase.from('lignes_bl').delete().in('bl_id', oldBlIds);
        await supabase.from('bons_livraison').delete().in('id', oldBlIds);
      }
      await supabase.from('commandes').delete().in('id', oldOrderIds);
    }
    await supabase.from('clients').delete().in('id', oldClientIds);
    console.log(`🧹 Cleaned up old gamification data.`);
  }

  // Clear snapshots and badges to recalculate
  await supabase.from('driver_badges').delete().in('driver_id', driverIds);
  await supabase.from('driver_performance_snapshots').delete().in('driver_id', driverIds);
  console.log('🧹 Cleaned up old snapshots and badges.');

  // 3. Create a single master test Client for gamification
  const { data: client, error: errClient } = await supabase
    .from('clients')
    .insert({
      nom: 'GAM-Client',
      prenom: 'Test',
      email: 'client.gam@decoshop.fr',
      telephone: '+33 6 99 99 99 99',
      adresse_ligne1: '100 Rue des Gamers',
      code_postal: '31000',
      ville: 'Toulouse',
      pays: 'France'
    })
    .select()
    .single();

  if (errClient) {
    console.error('Error creating client:', errClient);
    return;
  }
  const clientId = client.id;
  console.log('✅ Created mock client:', clientId);

  // Helper function to create a complete signed BL
  const createSignedBL = async (driverId, orderIndex, daysAgo, signDelaySec = 120) => {
    const orderNum = `GAM-CMD-${driverId.substring(0,4)}-${orderIndex}`;
    const blNum = `GAM-BL-${driverId.substring(0,4)}-${orderIndex}`;
    const dateStr = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
    const dateEffectiveStr = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 + 10 * 60 * 1000).toISOString(); // 10 mins later
    const dateSignStr = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000 + (10 * 60 + signDelaySec) * 1000).toISOString();

    // 1. Create order
    const { data: order, error: errOrder } = await supabase
      .from('commandes')
      .insert({
        client_id: clientId,
        numero_commande: orderNum,
        shopify_order_id: 'shopify-' + orderNum,
        statut: 'livree',
        montant_total_ttc: 150.00,
        date_commande: dateStr
      })
      .select()
      .single();

    if (errOrder) throw errOrder;

    // 2. Create BL
    const { data: bl, error: errBl } = await supabase
      .from('bons_livraison')
      .insert({
        commande_id: order.id,
        client_id: clientId,
        livreur_id: driverId,
        statut: 'signe',
        mode_livraison: 'domicile',
        creneau: 'apres_midi',
        date_livraison_prevue: dateStr.split('T')[0],
        date_livraison_effective: dateEffectiveStr,
        date_signature: dateSignStr,
        montant_total_ttc: 150.00
      })
      .select()
      .single();

    if (errBl) throw errBl;

    // 3. Create Line items
    await supabase.from('lignes_bl').insert({
      bl_id: bl.id,
      designation: 'Article Gamification Test',
      quantite: 1,
      prix_unitaire_ttc: 150.00,
      ordre_tri: 1
    });

    // 4. Create Signature
    await supabase.from('signatures_electroniques').insert({
      bl_id: bl.id,
      token: 'token-' + bl.id,
      email_client: 'client.gam@decoshop.fr',
      statut: 'signe',
      signature_data: 'data:image/png;base64,iVBORw0KGgo...',
      date_emission: dateStr,
      date_expiration: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      date_signature: dateSignStr
    });

    return bl.id;
  };

  // Helper function to create an active or failed BL
  const createBLWithStatus = async (driverId, orderIndex, status, daysAgo) => {
    const orderNum = `GAM-CMD-${driverId.substring(0,4)}-${orderIndex}`;
    const blNum = `GAM-BL-${driverId.substring(0,4)}-${orderIndex}`;
    const dateStr = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

    const { data: order } = await supabase
      .from('commandes')
      .insert({
        client_id: clientId,
        numero_commande: orderNum,
        shopify_order_id: 'shopify-' + orderNum,
        statut: status === 'signe' ? 'livree' : 'en_preparation',
        montant_total_ttc: 200.00,
        date_commande: dateStr
      })
      .select()
      .single();

    const { data: bl } = await supabase
      .from('bons_livraison')
      .insert({
        commande_id: order.id,
        client_id: clientId,
        livreur_id: driverId,
        statut: status,
        mode_livraison: 'domicile',
        creneau: 'matin',
        date_livraison_prevue: dateStr.split('T')[0],
        montant_total_ttc: 200.00
      })
      .select()
      .single();

    await supabase.from('lignes_bl').insert({
      bl_id: bl.id,
      designation: 'Article Gamification Test Status',
      quantite: 1,
      prix_unitaire_ttc: 200.00,
      ordre_tri: 1
    });

    return bl.id;
  };

  // 4. Seed Karim: 12 signed BLs (to unlock Bronze badge)
  console.log('Seeding 12 signed BLs for Karim...');
  for (let i = 1; i <= 12; i++) {
    await createSignedBL(DRIVERS.karim, i, i % 5 + 1, 100); // 100s signature delay (Fast Signer as well!)
  }

  // 5. Seed Yassine: 6 signed BLs (Perfect Week: 0 failures, >= 5 deliveries in 7 days)
  console.log('Seeding 6 signed BLs for Yassine...');
  for (let i = 1; i <= 6; i++) {
    await createSignedBL(DRIVERS.yassine, i, i % 3 + 1, 120);
  }

  // 6. Seed Mehdi: 12 BLs total (10 signed, 1 failed, 1 assigned)
  console.log('Seeding 12 BLs for Mehdi (10 signed, 1 failed, 1 assigned)...');
  for (let i = 1; i <= 10; i++) {
    await createSignedBL(DRIVERS.mehdi, i, i % 5 + 1, 400); // 400s sign delay (slower)
  }
  await createBLWithStatus(DRIVERS.mehdi, 11, 'echec_T1', 2);
  await createBLWithStatus(DRIVERS.mehdi, 12, 'assigne', 0);

  // 7. Seed Omar: 1 assigned BL (just to show activity)
  console.log('Seeding 1 assigned BL for Omar...');
  await createBLWithStatus(DRIVERS.omar, 1, 'assigne', 0);

  // 8. Run calculations for driver performance snapshots and award badges
  console.log('Calculating performance and badges in database...');
  for (const driverId of driverIds) {
    const { data: perfResult, error: perfError } = await supabase
      .rpc('calculate_driver_performance', { p_driver_id: driverId, p_date: new Date().toISOString().split('T')[0] });
    
    if (perfError) {
      console.error(`Error calculating performance for ${driverId}:`, perfError);
    } else {
      console.log(`Performance snapshot generated for driver ${driverId}:`, perfResult);
    }

    const { data: badgeResult, error: badgeError } = await supabase
      .rpc('check_and_award_badges', { p_driver_id: driverId });

    if (badgeError) {
      console.error(`Error awarding badges for ${driverId}:`, badgeError);
    } else {
      console.log(`Badges checked/awarded for driver ${driverId}:`, badgeResult);
    }
  }

  // 9. Seed 5 unassigned BLs (statut = 'cree', livreur_id = null)
  // This will trigger auto-assignment on insert and assign them to the driver with the least load
  console.log('Seeding 5 unassigned BLs to test auto-assignment trigger...');
  for (let i = 1; i <= 5; i++) {
    const orderNum = `GAM-UNASSIGNED-CMD-${i}`;
    
    const { data: order } = await supabase
      .from('commandes')
      .insert({
        client_id: clientId,
        numero_commande: orderNum,
        shopify_order_id: 'shopify-' + orderNum,
        statut: 'en_preparation',
        montant_total_ttc: 300.00,
        date_commande: new Date().toISOString()
      })
      .select()
      .single();

    // Trigger should automatically run BEFORE INSERT on public.bons_livraison
    const { data: bl, error: blError } = await supabase
      .from('bons_livraison')
      .insert({
        commande_id: order.id,
        client_id: clientId,
        livreur_id: null,
        statut: 'cree',
        mode_livraison: 'domicile',
        creneau: 'soir',
        date_livraison_prevue: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // tomorrow
        montant_total_ttc: 300.00
      })
      .select()
      .single();

    if (blError) {
      console.error(`Error inserting unassigned BL ${i}:`, blError);
    } else {
      console.log(`Inserted BL ${bl.numero_bl}. Auto-assigned to: ${bl.livreur_id || 'NONE (Failed)'} (Statut: ${bl.statut})`);
    }
  }

  console.log('🎉 Seeding and Auto-assignment simulation completed!');
}

main().catch(console.error);
