const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://syedoeskfykwedfhbpmm.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5ZWRvZXNrZnlrd2VkZmhicG1tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgyMTUzNCwiZXhwIjoyMDk1Mzk3NTM0fQ.Q3mEgpCFQYP8jL2NzAC7NeTA_oWIlCcKxKO9hscFf9k';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function main() {
  console.log('=== Database Diagnostic ===');

  const { data: profiles } = await supabase.from('profiles').select('id, email, nom, prenom');
  
  const { data: bls, error } = await supabase
    .from('bons_livraison')
    .select('id, numero_bl, statut, mode_livraison, livreur_id, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching BLs:', error);
  } else {
    console.log(`Total Delivery Notes (BLs) now: ${bls.length}`);
    
    const driverCounts = { 'Unassigned (null)': 0 };
    bls.forEach(b => {
      if (b.livreur_id) {
        const driver = profiles?.find(p => p.id === b.livreur_id);
        const driverName = driver ? `${driver.prenom} ${driver.nom}` : b.livreur_id;
        driverCounts[driverName] = (driverCounts[driverName] || 0) + 1;
      } else {
        driverCounts['Unassigned (null)']++;
      }
    });
    console.log('Assignments count:', driverCounts);
  }
}

main().catch(console.error);
