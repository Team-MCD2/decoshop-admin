import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminSidebar from './_components/AdminSidebar'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Retrieve authenticated profile details
  const { data: profile } = await supabase
    .from('profiles')
    .select('nom, prenom, email, role')
    .eq('id', user.id)
    .single()

  // Guard access - block livreurs and unauthorized roles
  if (!profile || profile.role === 'livreur') {
    await supabase.auth.signOut()
    redirect('/login?error=access_denied')
  }

  return (
    <div className="flex h-screen bg-cream overflow-hidden">
      {/* Sidebar Navigation */}
      <AdminSidebar profile={profile} />

      {/* Main Panel */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header Bar */}
        <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-navy-100 shadow-sm z-10">
          <h2 className="text-xl font-bold text-navy font-display mb-0">Espace Administration</h2>
          <div className="flex items-center gap-4">
            <div className="flex flex-col text-right">
              <span className="text-sm font-semibold text-ink">
                {profile.prenom} {profile.nom}
              </span>
              <span className="text-[10px] uppercase font-bold text-navy-500 tracking-wider">
                {profile.role === 'vendeur_proprietaire' ? 'Propriétaire' : profile.role}
              </span>
            </div>
            <div className="w-10 h-10 rounded-full bg-navy-100 border border-navy-200 flex items-center justify-center text-navy font-bold text-lg select-none">
              {profile.prenom?.[0] || ''}{profile.nom?.[0] || ''}
            </div>
          </div>
        </header>

        {/* Dynamic Workspace */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-cream">
          {children}
        </main>
      </div>
    </div>
  )
}
