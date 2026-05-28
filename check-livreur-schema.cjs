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
  console.log('=== Checking livreur schema ===');
  
  // Let's try querying livreur.bons_livraison
  const { data, error } = await supabase
    .from('livreur.bons_livraison')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error querying livreur.bons_livraison:', error.message, error.code);
  } else {
    console.log('Livreur schema bons_livraison count:', data);
  }
}

main().catch(console.error);
