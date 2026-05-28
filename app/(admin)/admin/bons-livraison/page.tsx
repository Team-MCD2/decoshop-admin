import { createClient } from '@/lib/supabase/server'
import BonsLivraisonClient from './BonsLivraisonClient'

export const revalidate = 0 // Disable cache to fetch live deliveries

export default async function BonsLivraisonPage() {
  const supabase = await createClient()

  // 1. Fetch all delivery notes with client details, commands, assigned drivers, and line items
  const { data: bls = [] } = await supabase
    .from('bons_livraison')
    .select('*, clients(*), commandes(*), livreur:profiles!bons_livraison_livreur_id_fkey(id, nom, prenom)')
    .order('created_at', { ascending: false })

  // 2. Fetch all active delivery drivers to enable assignment selection
  const { data: drivers = [] } = await supabase
    .from('profiles')
    .select('id, nom, prenom, is_active')
    .eq('role', 'livreur')
    .eq('is_active', true)

  return <BonsLivraisonClient initialBLs={bls || []} drivers={drivers || []} />
}
