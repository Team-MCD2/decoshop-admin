'use server';

import { cookies, headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { 
  generateChallenge, 
  verifySolution, 
  PowSolution, 
  PowChallenge 
} from '@/lib/security/pow';

/**
 * Utility: Retrieve current client IP address
 */
async function getClientIp(): Promise<string> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return headerList.get('x-real-ip') || '127.0.0.1';
}

/**
 * Utility: Enforce IP rate limiting for superadmin actions
 */
async function checkRateLimit(ip: string, actionType: string, limit: number = 3): Promise<void> {
  const adminDb = createAdminClient();
  const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
  
  const { count, error } = await adminDb
    .from('superadmin_security_log')
    .select('*', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('action_type', actionType)
    .gt('created_at', oneMinuteAgo);

  if (error) {
    console.error('[RateLimit] Error checking logs:', error);
    return;
  }

  if (count !== null && count >= limit) {
    // Log rate limit failure
    await adminDb.from('superadmin_security_log').insert({
      ip_address: ip,
      action_type: actionType,
      success: false
    });
    throw new Error(`Trop de tentatives. Limite de ${limit} essais par minute dépassée pour cet IP.`);
  }
}

/**
 * Utility: Log a security event
 */
async function logSecurityEvent(ip: string, actionType: string, success: boolean): Promise<void> {
  const adminDb = createAdminClient();
  await adminDb.from('superadmin_security_log').insert({
    ip_address: ip,
    action_type: actionType,
    success
  });
}

/**
 * Utility: Verify if the logged in user is a superadmin
 */
async function requireSuperadminRole(): Promise<void> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new Error('Non authentifié.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || profile.role !== 'superadmin') {
    throw new Error('Accès refusé. Rôle superadmin requis.');
  }
}

/**
 * Server Action: Generate a PoW challenge for the client
 */
export async function getSuperadminChallengeAction(): Promise<PowChallenge> {
  await requireSuperadminRole();
  const ip = await getClientIp();
  await checkRateLimit(ip, 'pow_request', 5); // Max 5 requests per minute

  const challenge = generateChallenge();
  await logSecurityEvent(ip, 'pow_request', true);
  return challenge;
}

/**
 * Server Action: Verify a solved PoW challenge and grant access
 */
export async function verifySuperadminPowAction(sol: PowSolution): Promise<{ success: boolean }> {
  await requireSuperadminRole();
  const ip = await getClientIp();
  await checkRateLimit(ip, 'pow_verify', 3); // Max 3 verifications per minute

  const isValid = verifySolution(sol);
  await logSecurityEvent(ip, 'pow_verify', isValid);

  if (!isValid) {
    throw new Error('Défi de sécurité invalide ou expiré.');
  }

  // Set secure HTTP-only cookie indicating superadmin unlock state
  const cookieStore = await cookies();
  cookieStore.set('superadmin_session_unlocked', 'true', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: 15 * 60, // 15 minutes unlock window
    path: '/admin',
    sameSite: 'lax'
  });

  return { success: true };
}

/**
 * Server Action: Check if the superadmin session is currently unlocked
 */
export async function checkSuperadminUnlockStatusAction(): Promise<boolean> {
  try {
    await requireSuperadminRole();
    const cookieStore = await cookies();
    return cookieStore.get('superadmin_session_unlocked')?.value === 'true';
  } catch {
    return false;
  }
}

/**
 * Server Action: Retrieve full database backup of operational tables
 */
export async function downloadDatabaseBackupAction(): Promise<string> {
  await requireSuperadminRole();
  
  const cookieStore = await cookies();
  const isUnlocked = cookieStore.get('superadmin_session_unlocked')?.value === 'true';
  if (!isUnlocked) {
    throw new Error('Session superadmin verrouillée. Veuillez résoudre le défi de sécurité.');
  }

  const ip = await getClientIp();
  await checkRateLimit(ip, 'db_backup', 2); // Max 2 backups per minute

  const adminDb = createAdminClient();
  const tables = [
    'profiles',
    'clients',
    'commandes',
    'bons_livraison',
    'lignes_bl',
    'creneaux_livraison',
    'signatures_electroniques',
    'driver_locations',
    'notifications',
    'push_subscriptions',
    'bl_attempt_log',
    'bl_status_history'
  ];

  const backupData: Record<string, any[]> = {};

  for (const table of tables) {
    const { data, error } = await adminDb.from(table).select('*');
    if (error) {
      console.error(`[Backup] Error backing up table ${table}:`, error);
      backupData[table] = [];
    } else {
      backupData[table] = data || [];
    }
  }

  await logSecurityEvent(ip, 'db_backup', true);
  return JSON.stringify(backupData, null, 2);
}

/**
 * Server Action: Lock superadmin dashboard session
 */
export async function lockSuperadminSessionAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete('superadmin_session_unlocked');
}

/**
 * Server Action: Wipe all operational data in database
 */
export async function wipeDatabaseAction(
  confirmationText: string,
  sol: PowSolution
): Promise<{ success: boolean }> {
  await requireSuperadminRole();

  const cookieStore = await cookies();
  const isUnlocked = cookieStore.get('superadmin_session_unlocked')?.value === 'true';
  if (!isUnlocked) {
    throw new Error('Session superadmin verrouillée. Veuillez résoudre le défi de sécurité.');
  }

  if (confirmationText !== 'EFFACER LA BASE DE DONNEES') {
    throw new Error('Texte de confirmation incorrect.');
  }

  const ip = await getClientIp();
  await checkRateLimit(ip, 'db_wipe', 2);

  // Verify the fresh PoW challenge submitted with the wipe action
  const isValidPow = verifySolution(sol);
  await logSecurityEvent(ip, 'db_wipe', isValidPow);

  if (!isValidPow) {
    throw new Error('Défi de sécurité invalide ou expiré pour la réinitialisation.');
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('wipe_operational_data');

  if (error) {
    console.error('[Wipe] Error running wipe RPC:', error);
    throw new Error(`La réinitialisation a échoué: ${error.message}`);
  }

  // Session auto-locks after destructive actions
  cookieStore.delete('superadmin_session_unlocked');

  return { success: true };
}
