-- ============================================================================
-- HOTFIX: Repair auth.identities — provider_id must be email, not UUID
-- Run this ONCE in Supabase SQL Editor to fix the 500 on signInWithPassword
-- ============================================================================

DO $$
DECLARE
  v_karim_id    uuid := 'aaaaaaaa-1111-1111-1111-111111111111';
  v_yassine_id  uuid := 'bbbbbbbb-2222-2222-2222-222222222222';
  v_mehdi_id    uuid := 'cccccccc-3333-3333-3333-333333333333';
  v_omar_id     uuid := 'dddddddd-4444-4444-4444-444444444444';
  v_fayssal_id  uuid := 'ffffffff-5555-5555-5555-555555555555';
BEGIN

  -- 1) Purge broken identities (provider_id was UUID instead of email)
  DELETE FROM auth.identities
  WHERE user_id IN (v_karim_id, v_yassine_id, v_mehdi_id, v_omar_id, v_fayssal_id);

  -- 2) Re-insert with correct provider_id = email address
  INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_karim_id,
     format('{"sub": "%s", "email": "%s", "email_verified": true, "phone_verified": false}', v_karim_id, 'karim@decoshop-toulouse.fr')::jsonb,
     'email', 'karim@decoshop-toulouse.fr', now(), now(), now()),

    (gen_random_uuid(), v_yassine_id,
     format('{"sub": "%s", "email": "%s", "email_verified": true, "phone_verified": false}', v_yassine_id, 'yassine@decoshop-toulouse.fr')::jsonb,
     'email', 'yassine@decoshop-toulouse.fr', now(), now(), now()),

    (gen_random_uuid(), v_mehdi_id,
     format('{"sub": "%s", "email": "%s", "email_verified": true, "phone_verified": false}', v_mehdi_id, 'mehdi@decoshop-toulouse.fr')::jsonb,
     'email', 'mehdi@decoshop-toulouse.fr', now(), now(), now()),

    (gen_random_uuid(), v_omar_id,
     format('{"sub": "%s", "email": "%s", "email_verified": true, "phone_verified": false}', v_omar_id, 'omar@decoshop-toulouse.fr')::jsonb,
     'email', 'omar@decoshop-toulouse.fr', now(), now(), now()),

    (gen_random_uuid(), v_fayssal_id,
     format('{"sub": "%s", "email": "%s", "email_verified": true, "phone_verified": false}', v_fayssal_id, 'fayssal@decoshop-toulouse.fr')::jsonb,
     'email', 'fayssal@decoshop-toulouse.fr', now(), now(), now());

  RAISE NOTICE '✅ Hotfix applied: 5 identities repaired (provider_id = email).';
END $$;
