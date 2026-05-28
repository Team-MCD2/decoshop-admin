'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard,
  ShoppingCart,
  FileText,
  Users,
  UserCheck,
  LogOut
} from 'lucide-react'

export default function AdminSidebar({
  profile,
}: {
  profile: { nom: string; prenom: string; email: string; role: string }
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const menuItems = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Commandes', href: '/admin/commandes', icon: ShoppingCart },
    { name: 'Bons de livraison', href: '/admin/bons-livraison', icon: FileText },
    { name: 'Livreurs', href: '/admin/livreurs', icon: Users },
    { name: 'Clients', href: '/admin/clients', icon: UserCheck },
  ]

  return (
    <aside className="w-64 bg-navy text-white flex flex-col justify-between h-full border-r border-navy-900 shrink-0">
      {/* Brand Header */}
      <div className="p-6">
        <div className="flex items-center gap-3 mb-8">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 200 200"
            width={32}
            height={32}
            aria-hidden="true"
            className="inline-block shrink-0"
          >
            <circle cx="100" cy="100" r="95" fill="#1E3A8A" />
            <g
              fontFamily="'Playfair Display', Arial, sans-serif"
              fontWeight="900"
              fill="#FACC15"
              textAnchor="middle"
            >
              <text x="100" y="115" fontSize="60" letterSpacing="2">
                DS
              </text>
            </g>
          </svg>
          <h1 className="text-xl font-bold font-display text-yellow tracking-wider mb-0">DECOSHOP</h1>
        </div>

        {/* Navigation links */}
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon
            // Exact match for /admin, prefix match for others (e.g. /admin/commandes)
            const isActive = item.href === '/admin' 
              ? pathname === '/admin'
              : pathname.startsWith(item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-yellow text-navy font-bold shadow-md transform translate-x-1'
                    : 'text-navy-100 hover:bg-navy-700 hover:text-white'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-navy' : 'text-navy-200'}`} />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Footer / Logout */}
      <div className="p-6 border-t border-navy-700 bg-navy-900/30 flex flex-col gap-4">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-red-200 hover:bg-red-950/30 hover:text-red-400 transition-colors"
        >
          <LogOut className="w-5 h-5 text-red-300" />
          Déconnexion
        </button>
        <div className="text-[10px] text-navy-300 text-center font-semibold tracking-wider">
          Fait avec ♥ par Microdidact
        </div>
      </div>
    </aside>
  )
}
