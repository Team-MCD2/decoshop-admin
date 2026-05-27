import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import SignClient from './SignClient'

interface PageProps {
  params: Promise<{ token: string }>
}

export const revalidate = 0 // Disable cache for live status checking

export default async function PublicSignaturePage({ params }: PageProps) {
  const { token } = await params
  const supabase = await createClient()

  // Query public signature details via RPC
  const { data: sigDetails, error } = await supabase.rpc('get_signature_public', {
    p_token: token
  })

  // If token is invalid or does not exist, trigger 404
  if (error || !sigDetails) {
    notFound()
  }

  return <SignClient initialDetails={sigDetails} token={token} />
}
