-- ============================================================================
-- NUCLEAR FIX: Complete auth cleanup + recreation
-- 
-- Run this FIRST in Supabase SQL Editor, THEN run: node sql/seed-users.mjs
-- ============================================================================

-- 1) Force delete ALL orphaned/corrupted test identities
DELETE FROM auth.identities 
WHERE user_id IN (
  'aaaaaaaa-1111-1111-1111-111111111111'::uuid,
  'bbbbbbbb-2222-2222-2222-222222222222'::uuid,
  'cccccccc-3333-3333-3333-333333333333'::uuid,
  'dddddddd-4444-4444-4444-444444444444'::uuid
);

-- 2) Force delete ALL orphaned/corrupted test users  
DELETE FROM auth.users 
WHERE id IN (
  'aaaaaaaa-1111-1111-1111-111111111111'::uuid,
  'bbbbbbbb-2222-2222-2222-222222222222'::uuid,
  'cccccccc-3333-3333-3333-333333333333'::uuid,
  'dddddddd-4444-4444-4444-444444444444'::uuid
);

-- 3) Also delete by email (in case they were inserted with a different UUID)
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

-- 4) Clean orphaned profiles (cascade should handle it, but be safe)
DELETE FROM public.profiles WHERE id IN (
  'aaaaaaaa-1111-1111-1111-111111111111'::uuid,
  'bbbbbbbb-2222-2222-2222-222222222222'::uuid,
  'cccccccc-3333-3333-3333-333333333333'::uuid,
  'dddddddd-4444-4444-4444-444444444444'::uuid,
  'ffffffff-5555-5555-5555-555555555555'::uuid
);

-- 5) Verify clean state
SELECT 'auth.users remaining' as check_name, count(*)::text as result 
FROM auth.users WHERE email LIKE '%decoshop-toulouse.fr'
UNION ALL
SELECT 'auth.identities remaining', count(*)::text
FROM auth.identities WHERE provider_id LIKE '%decoshop-toulouse.fr'
UNION ALL  
SELECT 'profiles remaining', count(*)::text
FROM public.profiles WHERE email LIKE '%decoshop-toulouse.fr';

-- Should show 0, 0, 0. Then run: node sql/seed-users.mjs
