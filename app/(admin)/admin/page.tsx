import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  TrendingUp,
  ShoppingCart,
  FileText,
  Users,
  CheckCircle,
  Clock,
  XCircle,
  Truck,
  Sparkles
} from 'lucide-react'

export const revalidate = 0 // Disable cache to ensure live database stats

export default async function AdminDashboardPage() {
  const supabase = await createClient()

  // 1. Fetch orders with client details
  const { data: orders = [] } = await supabase
    .from('commandes')
    .select('*, clients(*)')
    .order('date_commande', { ascending: false })

  // 2. Fetch delivery notes
  const { data: bls = [] } = await supabase
    .from('bons_livraison')
    .select('*, clients(*)')
    .order('created_at', { ascending: false })

  const ordersList = orders || []
  const blsList = bls || []

  // ---------- Calculations ----------
  const totalOrders = ordersList.length
  const totalRevenue = ordersList.reduce((acc, o) => acc + Number(o.montant_total_ttc || 0), 0)
  
  const statusCounts = {
    en_attente: ordersList.filter(o => o.statut === 'en_attente').length,
    en_preparation: ordersList.filter(o => o.statut === 'en_preparation').length,
    expediee: ordersList.filter(o => o.statut === 'expediee').length,
    livree: ordersList.filter(o => o.statut === 'livree').length,
    annulee: ordersList.filter(o => o.statut === 'annulee').length,
  }

  const fulfilledCount = statusCounts.expediee + statusCounts.livree
  const activeCount = statusCounts.en_preparation
  const unfulfilledCount = statusCounts.en_attente

  const shippingRate = totalOrders > 0 ? Math.round((fulfilledCount / totalOrders) * 100) : 0

  // 7-day daily activity
  const now = new Date()
  const days = 7
  const dailyActivity: Record<string, number> = {}
  for (let i = 0; i < days; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dailyActivity[d.toISOString().slice(0, 10)] = 0
  }

  ordersList.forEach((o) => {
    const dateKey = new Date(o.date_commande).toISOString().slice(0, 10)
    if (dateKey in dailyActivity) {
      dailyActivity[dateKey]++
    }
  })

  const dailyLabels = Object.keys(dailyActivity).sort()
  const dailyValues = dailyLabels.map((k) => dailyActivity[k])
  const maxDaily = Math.max(...dailyValues, 1)

  // Donut chart path generators
  const segments = [
    { pct: fulfilledCount / (totalOrders || 1), color: '#10b981', label: 'Expédiées', count: fulfilledCount },
    { pct: activeCount / (totalOrders || 1), color: '#f59e0b', label: 'En cours', count: activeCount },
    { pct: unfulfilledCount / (totalOrders || 1), color: '#dc2626', label: 'En attente', count: unfulfilledCount },
    { pct: statusCounts.annulee / (totalOrders || 1), color: '#9ca3af', label: 'Annulées', count: statusCounts.annulee },
  ].filter(s => s.count > 0)

  const donutPaths: { d: string; color: string }[] = []
  let cumAngle = -90
  const cx = 50, cy = 50, r = 38
  
  segments.forEach((seg) => {
    const angle = seg.pct * 360
    const startRad = (cumAngle * Math.PI) / 180
    const endRad = ((cumAngle + angle) * Math.PI) / 180
    const x1 = cx + r * Math.cos(startRad)
    const y1 = cy + r * Math.sin(startRad)
    const x2 = cx + r * Math.cos(endRad)
    const y2 = cy + r * Math.sin(endRad)
    const largeArc = angle > 180 ? 1 : 0
    donutPaths.push({
      d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`,
      color: seg.color,
    })
    cumAngle += angle
  })

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-navy-100 shadow-sm">
        <div>
          <h1 className="text-3xl font-bold font-display text-navy mb-1">Aperçu Général</h1>
          <p className="text-sm text-muted">Statistiques de livraison et activité des commandes Shopify.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/commandes"
            className="flex items-center gap-2 bg-yellow hover:bg-yellow-600 text-navy font-bold px-4 py-2.5 rounded-xl text-sm transition-all shadow-sm shrink-0"
          >
            <ShoppingCart className="w-4 h-4" />
            Voir Commandes
          </Link>
          <Link
            href="/admin/bons-livraison"
            className="flex items-center gap-2 bg-navy hover:bg-navy-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-all shadow-sm shrink-0"
          >
            <FileText className="w-4 h-4 text-navy-200" />
            Gérer les BL
          </Link>
          <Link
            href="/admin/generateur-affiche"
            className="flex items-center gap-2 bg-gradient-to-r from-navy via-navy-700 to-navy-800 text-white hover:from-navy-700 hover:via-navy-800 hover:to-navy-900 border border-yellow/30 hover:border-yellow/60 font-black px-4 py-2.5 rounded-xl text-sm transition-all shadow-lg hover:shadow-xl group relative overflow-hidden shrink-0 transform hover:scale-105 duration-200"
          >
            <Sparkles className="w-4 h-4 text-yellow animate-pulse group-hover:animate-bounce" />
            <span className="relative z-10">Générer Affiches</span>
            <span className="absolute inset-0 bg-yellow opacity-0 group-hover:opacity-5 transition-opacity rounded-xl"></span>
          </Link>
        </div>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Orders Card */}
        <div className="bg-white rounded-2xl border border-navy-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-bold text-muted tracking-wider">Commandes</span>
            <div className="p-2 rounded-lg bg-navy-50 text-navy">
              <ShoppingCart className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-navy">{totalOrders}</p>
          <p className="text-xs text-muted mt-1">Commandes Shopify capturées</p>
        </div>

        {/* Chiffre d'Affaires Card */}
        <div className="bg-white rounded-2xl border border-navy-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-bold text-muted tracking-wider">Chiffre d&apos;affaires</span>
            <div className="p-2 rounded-lg bg-green-50 text-success">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-green-700">
            {totalRevenue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })}
          </p>
          <p className="text-xs text-muted mt-1">Montant total TTC cumulé</p>
        </div>

        {/* Taux d'expédition Card */}
        <div className="bg-white rounded-2xl border border-navy-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-bold text-muted tracking-wider">Taux d&apos;expédition</span>
            <div className="p-2 rounded-lg bg-yellow-50 text-yellow-600">
              <Truck className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-navy">{shippingRate}%</p>
          <p className="text-xs text-muted mt-1">Pourcentage de commandes expédiées</p>
        </div>

        {/* Bons à Planifier Card */}
        <div className="bg-white rounded-2xl border border-navy-100 p-5 shadow-sm hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase font-bold text-muted tracking-wider">BL non assignés</span>
            <div className="p-2 rounded-lg bg-red-50 text-danger">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-3xl font-black text-red-600">
            {blsList.filter(b => b.statut === 'cree').length}
          </p>
          <p className="text-xs text-muted mt-1">Bons de livraison en attente de chauffeur</p>
        </div>
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Daily orders bar chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-navy-100 p-6 shadow-sm">
          <h3 className="text-base font-bold text-navy font-display mb-6">Activité Commande (7 derniers jours)</h3>
          <div className="flex items-end gap-3 h-48 select-none">
            {dailyLabels.map((label, i) => {
              const pct = (dailyValues[i] / maxDaily) * 100
              const dateObj = new Date(label)
              const dayStr = dateObj.toLocaleDateString('fr-FR', { weekday: 'short' })
              const labelStr = dateObj.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
              return (
                <div key={label} className="flex-1 flex flex-col items-center gap-2 group">
                  <span className="text-xs font-bold text-navy opacity-0 group-hover:opacity-100 transition-opacity">
                    {dailyValues[i]}
                  </span>
                  <div className="w-full rounded-t-lg bg-navy hover:bg-yellow transition-all duration-300" style={{ height: `${Math.max(pct, 6)}%` }} />
                  <span className="text-[10px] uppercase font-bold text-muted capitalize">{dayStr}</span>
                  <span className="text-[8px] text-gray-400 group-hover:text-muted">{labelStr}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Status donut chart */}
        <div className="bg-white rounded-2xl border border-navy-100 p-6 shadow-sm flex flex-col items-center">
          <h3 className="text-base font-bold text-navy font-display mb-6 self-start">Répartition des Statuts</h3>
          
          <div className="relative h-32 w-32 mb-6">
            <svg viewBox="0 0 100 100" className="h-full w-full transform -rotate-90">
              {donutPaths.map((p, i) => (
                <path key={i} d={p.d} fill={p.color} className="hover:opacity-90 transition-opacity cursor-pointer" />
              ))}
              <circle cx="50" cy="50" r="24" className="fill-white" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-black text-navy">{totalOrders}</span>
              <span className="text-[8px] uppercase tracking-wider font-bold text-muted">Commandes</span>
            </div>
          </div>

          <div className="w-full space-y-2 text-xs">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center justify-between p-2 rounded-lg hover:bg-navy-50 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="font-semibold text-ink">{s.label}</span>
                </div>
                <span className="font-bold text-navy">{s.count} ({Math.round(s.pct * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Orders & Delivery Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Orders */}
        <div className="bg-white rounded-2xl border border-navy-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-navy font-display mb-0">Dernières Commandes</h3>
            <Link href="/admin/commandes" className="text-xs font-bold text-navy hover:text-yellow transition-colors underline">
              Voir tout
            </Link>
          </div>
          {ordersList.length === 0 ? (
            <p className="text-sm text-muted py-4">Aucune commande enregistrée.</p>
          ) : (
            <div className="divide-y divide-navy-50">
              {ordersList.slice(0, 5).map((order) => (
                <div key={order.id} className="py-3 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-navy text-sm">{order.numero_commande}</p>
                    <p className="text-xs text-muted">
                      {order.clients?.prenom} {order.clients?.nom} &bull; {new Date(order.date_commande).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-navy text-sm">
                      {Number(order.montant_total_ttc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      order.statut === 'expediee' || order.statut === 'livree'
                        ? 'bg-green-100 text-green-800'
                        : order.statut === 'en_preparation'
                        ? 'bg-amber-100 text-amber-800'
                        : order.statut === 'annulee'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {order.statut}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Delivery Notes */}
        <div className="bg-white rounded-2xl border border-navy-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-bold text-navy font-display mb-0">Suivi des Livraisons</h3>
            <Link href="/admin/bons-livraison" className="text-xs font-bold text-navy hover:text-yellow transition-colors underline">
              Voir tout
            </Link>
          </div>
          {blsList.length === 0 ? (
            <p className="text-sm text-muted py-4">Aucun bon de livraison généré.</p>
          ) : (
            <div className="divide-y divide-navy-50">
              {blsList.slice(0, 5).map((bl) => (
                <div key={bl.id} className="py-3 flex items-center justify-between">
                  <div>
                    <Link href={`/admin/bons-livraison/${bl.id}`} className="font-bold text-navy text-sm hover:underline flex items-center gap-1.5">
                      {bl.numero_bl}
                    </Link>
                    <p className="text-xs text-muted">
                      {bl.clients?.prenom} {bl.clients?.nom} &bull; Prévu: {bl.date_livraison_prevue ? new Date(bl.date_livraison_prevue).toLocaleDateString('fr-FR') : 'Non planifié'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted capitalize">
                      {bl.creneau ? `${bl.creneau}` : 'Créneau non spécifié'}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      bl.statut === 'signe' || bl.statut === 'livre'
                        ? 'bg-green-100 text-green-800'
                        : bl.statut === 'en_route' || bl.statut === 'en_livraison'
                        ? 'bg-blue-100 text-blue-800'
                        : bl.statut === 'cree'
                        ? 'bg-gray-100 text-gray-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {bl.statut}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
