const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Parse .env.local file
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (!fs.existsSync(envPath)) {
    console.warn('⚠️ No .env.local found in project root.');
    return {};
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
      env[key] = value;
    }
  });
  return env;
}

async function runRlsTests() {
  console.log('🧪 Running Supabase Row Level Security (RLS) Integration Tests...');
  const env = loadEnv();
  
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Skipping RLS Tests: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY missing in environment.');
    return false;
  }

  let passed = 0;
  let failed = 0;

  const assert = (name, condition) => {
    if (condition) {
      console.log(`  ✅ Passed: ${name}`);
      passed++;
    } else {
      console.error(`  ❌ Failed: ${name}`);
      failed++;
    }
  };

  try {
    // 1. Initialize anonymous/unauthenticated client
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Test 1: Anonymous user cannot read profiles
    const { data: pData, error: pError } = await anonClient
      .from('profiles')
      .select('*');
    assert('Anonymous user is blocked from reading profiles', pError !== null || (pData && pData.length === 0));

    // Test 2: Anonymous user cannot read orders (commandes)
    const { data: cData, error: cError } = await anonClient
      .from('commandes')
      .select('*');
    assert('Anonymous user is blocked from reading orders', cError !== null || (cData && cData.length === 0));

    // Test 3: Anonymous user cannot read delivery notes (bons_livraison)
    const { data: bData, error: bError } = await anonClient
      .from('bons_livraison')
      .select('*');
    assert('Anonymous user is blocked from reading delivery notes', bError !== null || (bData && bData.length === 0));

    // Test 4: Anonymous user cannot insert client logs
    const { error: insError } = await anonClient
      .from('clients')
      .insert({ nom: 'Test Anon', adresse_ligne1: '123 Fake St' });
    assert('Anonymous user is blocked from writing client files', insError !== null);

    console.log(`\n📊 RLS Tests Summary: ${passed} Passed, ${failed} Failed\n`);
    return failed === 0;
  } catch (err) {
    console.error('❌ Error executing RLS tests:', err);
    return false;
  }
}

module.exports = { runRlsTests };
if (require.main === module) {
  runRlsTests();
}
