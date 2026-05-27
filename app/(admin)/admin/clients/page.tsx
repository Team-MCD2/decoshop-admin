import { createClient } from '@/lib/supabase/server'
import ClientsClient from './ClientsClient'

export const revalidate = 0 // Disable cache for live updates

export default async function ClientsPage() {
  const supabase = await createClient()

  // Fetch all clients
  const { data: clients = [] } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  return <ClientsClient initialClients={clients || []} />
}
