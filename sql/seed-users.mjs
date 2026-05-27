/**
 * ============================================================================
 *  DecoShop Admin — Seed Script via Supabase Auth Admin API (v2)
 * ============================================================================
 * 
 *  PREREQUISITE: Run sql/cleanup_auth.sql in Supabase SQL Editor FIRST
 *  
 *  Then run: node sql/seed-users.mjs
 * ============================================================================
 */

const SUPABASE_URL = 'https://syedoeskfykwedfhbpmm.supabase.co';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5ZWRvZXNrZnlrd2VkZmhicG1tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgyMTUzNCwiZXhwIjoyMDk1Mzk3NTM0fQ.Q3mEgpCFQYP8jL2NzAC7NeTA_oWIlCcKxKO9hscFf9k';

const USERS = [
  {
    email: 'karim@decoshop-toulouse.fr',
    password: 'Test1234!',
    user_metadata: {
      nom: 'BENALI',
      prenom: 'Karim',
      telephone: '+33 6 00 00 00 01',
      preferred_language: 'fr',
    },
  },
  {
    email: 'yassine@decoshop-toulouse.fr',
    password: 'Test1234!',
    user_metadata: {
      nom: 'EL AMRANI',
      prenom: 'Yassine',
      telephone: '+33 6 00 00 00 02',
      preferred_language: 'fr',
    },
  },
  {
    email: 'mehdi@decoshop-toulouse.fr',
    password: 'Test1234!',
    user_metadata: {
      nom: 'ZAHIDI',
      prenom: 'Mehdi',
      telephone: '+33 6 00 00 00 03',
      preferred_language: 'ar',
    },
  },
  {
    email: 'omar@decoshop-toulouse.fr',
    password: 'Test1234!',
    user_metadata: {
      nom: 'CHAKIR',
      prenom: 'Omar',
      telephone: '+33 6 00 00 00 04',
      preferred_language: 'fr',
    },
  },
  {
    email: 'fayssal@decoshop-toulouse.fr',
    password: 'Admin1234!',
    user_metadata: {
      nom: 'BOUSSATTA',
      prenom: 'Fayssal',
      telephone: '+33 7 67 27 86 25',
      preferred_language: 'fr',
    },
  },
];

// Matching role config for profiles (will be set via SQL after user creation)
const PROFILE_ROLES = {
  'karim@decoshop-toulouse.fr': 'livreur',
  'yassine@decoshop-toulouse.fr': 'livreur',
  'mehdi@decoshop-toulouse.fr': 'livreur',
  'omar@decoshop-toulouse.fr': 'livreur',
  'fayssal@decoshop-toulouse.fr': 'vendeur_proprietaire',
};

async function adminRequest(method, path, body) {
  const url = `${SUPABASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, ok: res.ok, data };
}

async function supabaseQuery(sql) {
  // Use the Supabase REST API to run raw SQL via the pg_rest endpoint
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      'apikey': SERVICE_ROLE_KEY,
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({ query: sql }),
  });
  return res;
}

async function main() {
  console.log('🚀 DecoShop Auth Seed v2 — Supabase Admin API\n');
  console.log(`   Target: ${SUPABASE_URL}`);
  console.log(`   Time:   ${new Date().toISOString()}\n`);

  // Step 1: Verify connection by listing users
  console.log('🔍 Step 1: Verifying admin access...\n');
  const listRes = await adminRequest('GET', '/auth/v1/admin/users?page=1&per_page=10');
  if (!listRes.ok) {
    console.error('❌ Cannot connect to Supabase Admin API!');
    console.error('   Status:', listRes.status);
    console.error('   Response:', JSON.stringify(listRes.data, null, 2));
    console.error('\n   Check your SERVICE_ROLE_KEY is correct.');
    process.exit(1);
  }
  console.log(`   ✅ Connected. ${listRes.data.users?.length || 0} existing users found.\n`);

  // Step 2: Delete existing test users via admin API (by email)
  console.log('🧹 Step 2: Deleting existing test users...\n');
  
  // Get full user list to find our test users
  let allUsers = [];
  let page = 1;
  while (true) {
    const pageRes = await adminRequest('GET', `/auth/v1/admin/users?page=${page}&per_page=50`);
    if (!pageRes.ok || !pageRes.data?.users?.length) break;
    allUsers = allUsers.concat(pageRes.data.users);
    if (pageRes.data.users.length < 50) break;
    page++;
  }

  const testEmails = USERS.map(u => u.email);
  const existingTestUsers = allUsers.filter(u => testEmails.includes(u.email));

  for (const user of existingTestUsers) {
    const delRes = await adminRequest('DELETE', `/auth/v1/admin/users/${user.id}`);
    if (delRes.ok) {
      console.log(`   ✅ Deleted: ${user.email} (${user.id})`);
    } else {
      console.log(`   ⚠️  Delete failed for ${user.email}: ${JSON.stringify(delRes.data)}`);
    }
  }

  if (existingTestUsers.length === 0) {
    console.log('   ⏭️  No existing test users found (clean state).');
  }

  // Small delay to let GoTrue process deletes
  await new Promise(r => setTimeout(r, 1000));

  // Step 3: Create users (WITHOUT specifying id — let GoTrue generate)
  console.log('\n📝 Step 3: Creating users via GoTrue Admin API...\n');
  const createdUsers = [];

  for (const user of USERS) {
    const payload = {
      email: user.email,
      password: user.password,
      email_confirm: true,
      user_metadata: user.user_metadata,
    };

    const res = await adminRequest('POST', '/auth/v1/admin/users', payload);

    if (res.ok && res.data?.id) {
      console.log(`   ✅ Created: ${user.email} → id: ${res.data.id}`);
      createdUsers.push({ email: user.email, id: res.data.id });
    } else {
      console.error(`   ❌ FAILED: ${user.email}`);
      console.error(`      Status: ${res.status}`);
      console.error(`      Error:`, JSON.stringify(res.data, null, 2));
    }

    // Small delay between creations
    await new Promise(r => setTimeout(r, 300));
  }

  // Step 4: Verify login works
  console.log('\n🧪 Step 4: Testing login for created users...\n');

  for (const user of USERS.slice(0, 2)) { // Test first 2
    const loginRes = await adminRequest('POST', '/auth/v1/token?grant_type=password', {
      email: user.email,
      password: user.password,
    });

    if (loginRes.ok && loginRes.data?.access_token) {
      console.log(`   ✅ Login OK: ${user.email}`);
    } else {
      console.error(`   ❌ Login FAILED: ${user.email}`);
      console.error(`      Status: ${loginRes.status}`);
      console.error(`      Error:`, JSON.stringify(loginRes.data, null, 2));
    }
  }

  // Step 5: Generate SQL for profiles
  console.log('\n📋 Step 5: Profile SQL to run in Supabase SQL Editor:\n');
  console.log('   Copy and run this SQL to create the profiles:\n');
  console.log('   ─────────────────────────────────────────────\n');

  let profileSQL = '';
  for (const cu of createdUsers) {
    const role = PROFILE_ROLES[cu.email] || 'vendeur';
    const u = USERS.find(u => u.email === cu.email);
    profileSQL += `INSERT INTO public.profiles (id, email, nom, prenom, telephone, role, is_active)
VALUES ('${cu.id}', '${cu.email}', '${u.user_metadata.nom}', '${u.user_metadata.prenom}', '${u.user_metadata.telephone}', '${role}'::public.user_role, true)
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, is_active = true, nom = EXCLUDED.nom, prenom = EXCLUDED.prenom;\n\n`;
  }

  console.log(profileSQL);

  // Summary
  const ok = createdUsers.length;
  const fail = USERS.length - ok;

  console.log('═'.repeat(60));
  console.log(`\n📊 Result: ${ok} created, ${fail} failed\n`);

  if (ok === USERS.length) {
    console.log('🎉 ALL USERS CREATED SUCCESSFULLY!\n');
    console.log('Next steps:');
    console.log('  1. Copy the profile SQL above → run in Supabase SQL Editor');
    console.log('  2. Then run the rest of 006_seed_dev.sql (from section 3 onwards)');
    console.log('     to create clients, commandes, bons_livraison, etc.\n');
    console.log('Test credentials:');
    console.log('┌──────────────────────────────────────────────────────┐');
    console.log('│ Admin:   fayssal@decoshop-toulouse.fr / Admin1234!  │');
    console.log('│ Livreur: karim@decoshop-toulouse.fr   / Test1234!   │');
    console.log('└──────────────────────────────────────────────────────┘\n');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
