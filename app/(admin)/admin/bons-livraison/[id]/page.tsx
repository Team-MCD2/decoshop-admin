import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BLDetailClient from './BLDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export const revalidate = 0 // Disable cache for live details

export default async function BLDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  // 1. Fetch BL details, client, related order, assigned driver, line items, and signature
  const { data: bl } = await supabase
    .from('bons_livraison')
    .select(`
      *,
      clients (*),
      commandes (*),
      livreur:profiles!bons_livraison_livreur_id_fkey (id, nom, prenom, telephone, vehicle_type, vehicle_immatriculation),
      lignes_bl (*),
      signatures_electroniques (*)
    `)
    .eq('id', id)
    .single()

  if (!bl) {
    notFound()
  }

  // 2. Fetch active delivery drivers for assignment dropdown
  const { data: drivers = [] } = await supabase
    .from('profiles')
    .select('id, nom, prenom, is_active')
    .eq('role', 'livreur')
    .eq('is_active', true)

  // 3. Fetch history of state transitions
  const { data: history = [] } = await supabase
    .from('bl_status_history')
    .select(`
      id,
      ancien_statut,
      nouveau_statut,
      trigger_source,
      metadata,
      changed_at,
      triggered_by_profile:profiles!bl_status_history_triggered_by_fkey (id, nom, prenom)
    `)
    .eq('bl_id', id)
    .order('changed_at', { ascending: false })

  // 4. Fetch failed attempt logs (KPIs & history)
  const { data: attempts = [] } = await supabase
    .from('bl_attempt_log')
    .select(`
      id,
      numero_tentative,
      motif,
      commentaire,
      photo_litige_url,
      latitude,
      longitude,
      recorded_at,
      livreur_profile:profiles!bl_attempt_log_livreur_id_fkey (id, nom, prenom)
    `)
    .eq('bl_id', id)
    .order('recorded_at', { ascending: false })

  return (
    <BLDetailClient
      initialBL={bl}
      drivers={drivers || []}
      history={history || []}
      attempts={attempts || []}
    />
  )
}
