import { createClient } from '@/lib/supabase/server'
import CommandesClient from './CommandesClient'

export const revalidate = 0 // Disable cache to ensure live order lists

export default async function CommandesPage() {
  const supabase = await createClient()

  // Query command details, clients, and related Bons de Livraison + line items
  const { data: orders = [] } = await supabase
    .from('commandes')
    .select('*, clients(*), bons_livraison(*, lignes_bl(*))')
    .order('date_commande', { ascending: false })

  return <CommandesClient initialOrders={orders || []} />
}
