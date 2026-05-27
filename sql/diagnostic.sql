-- ============================================================================
-- COMPREHENSIVE AUTH DIAGNOSTIC & ERROR FINDER (v3)
-- 
-- Run this entire script in the Supabase Studio SQL Editor.
-- It will safely execute queries, catch any database errors, and return
-- the exact PostgreSQL error messages and codes instead of crashing.
-- ============================================================================

-- 1) Create a safe diagnostic function to intercept and report errors
CREATE OR REPLACE FUNCTION public.check_auth_error()
RETURNS TABLE (
  test_name text,
  status text,
  sql_code text,
  error_msg text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count int;
BEGIN
  -- Test 1: Reading auth.users
  test_name := 'SELECT FROM auth.users';
  BEGIN
    SELECT count(*) INTO v_count FROM auth.users;
    status := 'SUCCESS';
    sql_code := '00000';
    error_msg := 'Count: ' || v_count::text;
  EXCEPTION WHEN OTHERS THEN
    status := 'FAILED';
    sql_code := SQLSTATE;
    error_msg := SQLERRM;
  END;
  RETURN NEXT;

  -- Test 2: Reading auth.identities
  test_name := 'SELECT FROM auth.identities';
  BEGIN
    SELECT count(*) INTO v_count FROM auth.identities;
    status := 'SUCCESS';
    sql_code := '00000';
    error_msg := 'Count: ' || v_count::text;
  EXCEPTION WHEN OTHERS THEN
    status := 'FAILED';
    sql_code := SQLSTATE;
    error_msg := SQLERRM;
  END;
  RETURN NEXT;

  -- Test 3: Reading public.profiles
  test_name := 'SELECT FROM public.profiles';
  BEGIN
    SELECT count(*) INTO v_count FROM public.profiles;
    status := 'SUCCESS';
    sql_code := '00000';
    error_msg := 'Count: ' || v_count::text;
  EXCEPTION WHEN OTHERS THEN
    status := 'FAILED';
    sql_code := SQLSTATE;
    error_msg := SQLERRM;
  END;
  RETURN NEXT;
END;
$$;

-- 2) Run the diagnostic tests
SELECT * FROM public.check_auth_error();

-- 3) Query RLS policies on auth tables (to see if RLS was accidentally enabled)
SELECT 
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'auth' AND tablename IN ('users', 'identities');

-- 4) Query ALL triggers on auth.users and auth.identities
SELECT 
  c.relname AS table_name,
  t.tgname AS trigger_name,
  p.proname AS function_name,
  n.nspname AS function_schema,
  t.tgenabled AS enabled
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace cn ON c.relnamespace = cn.oid
JOIN pg_proc p ON t.tgfoid = p.oid
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE cn.nspname = 'auth' AND c.relname IN ('users', 'identities')
ORDER BY c.relname, t.tgname;
