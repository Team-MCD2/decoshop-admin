import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Retrieve user role from profiles to route correctly
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'livreur') {
    const livreurUrl = process.env.NEXT_PUBLIC_LIVREUR_URL || 'http://localhost:5173'
    redirect(livreurUrl)
  } else if (profile) {
    redirect('/admin')
  } else {
    // If no profile exists, log out and redirect to login page
    await supabase.auth.signOut()
    redirect('/login?error=access_denied')
  }
}
