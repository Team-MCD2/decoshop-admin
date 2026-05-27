import { createClient } from '@/lib/supabase/server'
import LivreursClient from './LivreursClient'

export const revalidate = 0 // Disable cache for live driver states

export default async function LivreursPage() {
  const supabase = await createClient()

  // Fetch all profiles with role = 'livreur', joined with their badges and performance snapshots
  const { data: drivers = [] } = await supabase
    .from('profiles')
    .select(`
      *,
      driver_badges (
        badge_key,
        earned_at
      ),
      driver_performance_snapshots (
        quality_score,
        snapshot_date,
        signature_rate,
        success_rate,
        on_time_rate
      )
    `)
    .eq('role', 'livreur')
    .order('created_at', { ascending: false })

  return <LivreursClient initialDrivers={drivers || []} />
}
