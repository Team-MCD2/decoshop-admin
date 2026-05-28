'use client'

import { useState, useMemo } from 'react'
import { inviteDriverAction, updateDriverAction, deleteDriverAction, resetDriverPasswordAction } from './actions'
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Mail,
  Phone,
  Truck,
  CheckCircle,
  XCircle,
  X,
  Users,
  MapPin,
  Shield,
  Activity,
  Layers,
  ChevronRight,
  Award,
  Zap,
  Crown,
  Copy
} from 'lucide-react'
import { useI18n } from '@/lib/i18n'

const getBadgeConfig = (key: string) => {
  switch (key) {
    case 'bronze_delivery':
      return { shortName: 'Bronze', title: 'Bronze: 10 livraisons signées', icon: Award, style: 'bg-amber-50 text-amber-800 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30' }
    case 'silver_delivery':
      return { shortName: 'Argent', title: 'Argent: 50 livraisons signées', icon: Award, style: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/20 dark:border-slate-800/30' }
    case 'gold_delivery':
      return { shortName: 'Or', title: 'Or: 100 livraisons signées', icon: Award, style: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-900/30' }
    case 'perfect_week':
      return { shortName: 'Perfect', title: 'Perfect Week: 0 échecs sur 7 jours', icon: Shield, style: 'bg-emerald-50 text-emerald-800 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/30' }
    case 'fast_signer':
      return { shortName: 'Rapide', title: 'Fast Signer: signature client en < 5m', icon: Zap, style: 'bg-sky-50 text-sky-800 border-sky-100 dark:bg-sky-950/20 dark:border-sky-900/30' }
    case 'ruler_of_the_road':
      return { shortName: 'Légende', title: 'Légende de la Route: >=95% de ponctualité sur 30 jours', icon: Crown, style: 'bg-navy-50 text-navy border-navy-100 dark:bg-blue-950/20 dark:border-blue-900/30' }
    default:
      return { shortName: 'Badge', title: 'Badge de performance', icon: Shield, style: 'bg-cream-100 text-muted border-cream-200 dark:bg-slate-800 dark:border-slate-700' }
  }
}


export default function LivreursClient({ initialDrivers }: { initialDrivers: any[] }) {
  const { locale } = useI18n()
  const [drivers, setDrivers] = useState<any[]>(initialDrivers)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')

  // Modals state
  const [inviteOpen, setInviteOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [selectedDriver, setSelectedDriver] = useState<any | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Sync initial drivers
  useMemo(() => {
    setDrivers(initialDrivers)
  }, [initialDrivers])

  // Form states - Invite
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNom, setInviteNom] = useState('')
  const [invitePrenom, setInvitePrenom] = useState('')
  const [invitePhone, setInvitePhone] = useState('')

  // Form states - Edit
  const [editNom, setEditNom] = useState('')
  const [editPrenom, setEditPrenom] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [editVehicleType, setEditVehicleType] = useState<'voiture' | 'utilitaire' | 'camionnette' | 'camion' | null>(null)
  const [editVehicleCapacity, setEditVehicleCapacity] = useState<number | null>(null)
  const [editVehicleImmat, setEditVehicleImmat] = useState('')
  const [editZones, setEditZones] = useState<string[]>([])
  const [newZoneInput, setNewZoneInput] = useState('')

  // Filter drivers list
  const filteredDrivers = useMemo(() => {
    return drivers.filter((d) => {
      const query = search.toLowerCase()
      const matchName = `${d.prenom || ''} ${d.nom || ''}`.toLowerCase().includes(query)
      const matchEmail = (d.email || '').toLowerCase().includes(query)
      const matchPhone = (d.telephone || '').includes(query)
      const matchSearch = matchName || matchEmail || matchPhone

      if (statusFilter === 'active') return matchSearch && d.is_active
      if (statusFilter === 'inactive') return matchSearch && !d.is_active
      return matchSearch
    })
  }, [drivers, search, statusFilter])

  // Summary stats
  const stats = useMemo(() => {
    const total = drivers.length
    const active = drivers.filter((d) => d.is_active).length
    const inactive = total - active
    const totalCapacity = drivers.reduce((sum, d) => sum + Number(d.vehicle_capacity_m3 || 0), 0)
    return { total, active, inactive, totalCapacity }
  }, [drivers])

  // Launch Invite Modal
  const openInvite = () => {
    setInviteEmail('')
    setInviteNom('')
    setInvitePrenom('')
    setInvitePhone('')
    setInviteOpen(true)
  }

  // Handle Invite Submission
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail || !inviteNom || !invitePrenom) {
      alert('Veuillez remplir tous les champs obligatoires.')
      return
    }
    setSubmitting(true)
    const res = await inviteDriverAction(inviteEmail, inviteNom, invitePrenom, invitePhone)
    setSubmitting(false)
    if (res.success) {
      setInviteOpen(false)
      alert('Livreur invité avec succès ! Un e-mail d\'invitation lui a été envoyé.')
    } else {
      alert(`Erreur : ${res.error}`)
    }
  }

  // Launch Edit Modal
  const openEdit = (driver: any) => {
    setSelectedDriver(driver)
    setEditNom(driver.nom || '')
    setEditPrenom(driver.prenom || '')
    setEditPhone(driver.telephone || '')
    setEditIsActive(driver.is_active)
    setEditVehicleType(driver.vehicle_type || null)
    setEditVehicleCapacity(driver.vehicle_capacity_m3 ? Number(driver.vehicle_capacity_m3) : null)
    setEditVehicleImmat(driver.vehicle_immatriculation || '')
    setEditZones(driver.zones_couvertes || [])
    setNewZoneInput('')
    setEditOpen(true)
  }

  // Add a cover zone tag
  const addZone = () => {
    const zone = newZoneInput.trim()
    if (zone && !editZones.includes(zone)) {
      setEditZones([...editZones, zone])
      setNewZoneInput('')
    }
  }

  // Remove a cover zone tag
  const removeZone = (z: string) => {
    setEditZones(editZones.filter((item) => item !== z))
  }

  // Handle Edit Submission
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDriver) return
    setSubmitting(true)
    const res = await updateDriverAction(selectedDriver.id, {
      nom: editNom,
      prenom: editPrenom,
      telephone: editPhone,
      is_active: editIsActive,
      vehicle_type: editVehicleType,
      vehicle_capacity_m3: editVehicleCapacity,
      vehicle_immatriculation: editVehicleImmat || null,
      zones_couvertes: editZones
    })
    setSubmitting(false)
    if (res.success) {
      alert('Profil mis à jour !')
      setEditOpen(false)
    } else {
      alert(`Erreur : ${res.error}`)
    }
  }

  // Handle Driver Deletion
  const handleDelete = async (driver: any) => {
    const confirmed = window.confirm(
      `Êtes-vous sûr de vouloir supprimer définitivement le livreur ${driver.prenom} ${driver.nom} ? Cette action supprimera également son compte d'authentification.`
    )
    if (!confirmed) return

    setSubmitting(true)
    const res = await deleteDriverAction(driver.id)
    setSubmitting(false)

    if (res.success) {
      alert('Livreur supprimé avec succès.')
      setDrivers(drivers.filter((d) => d.id !== driver.id))
    } else {
      alert(`Erreur de suppression : ${res.error}`)
    }
  }

  return (
    <div className="space-y-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold font-display text-navy mb-0">Chauffeurs Livreurs</h1>
          <p className="text-xs text-muted">Gérez les véhicules, les capacités volumétriques, les zones géographiques et les invitations.</p>
        </div>

        <button
          onClick={openInvite}
          className="rounded-xl bg-navy hover:bg-navy-700 text-white font-bold px-4 py-2.5 text-xs transition-all shadow-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4 text-navy-200" />
          Inviter un livreur
        </button>
      </div>

      {/* KPI summaries cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total */}
        <div className="bg-white p-5 rounded-2xl border border-navy-100 shadow-sm flex items-center gap-4">
          <div className="rounded-xl bg-navy-50 p-3 text-navy">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted tracking-wider">Total Chauffeurs</div>
            <div className="text-xl font-bold text-navy">{stats.total}</div>
          </div>
        </div>

        {/* Card 2: Active */}
        <div className="bg-white p-5 rounded-2xl border border-navy-100 shadow-sm flex items-center gap-4">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
            <CheckCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted tracking-wider">Actifs en service</div>
            <div className="text-xl font-bold text-navy">{stats.active}</div>
          </div>
        </div>

        {/* Card 3: Inactive */}
        <div className="bg-white p-5 rounded-2xl border border-navy-100 shadow-sm flex items-center gap-4">
          <div className="rounded-xl bg-slate-50 p-3 text-slate-500">
            <XCircle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted tracking-wider">Suspendus / Inactifs</div>
            <div className="text-xl font-bold text-navy">{stats.inactive}</div>
          </div>
        </div>

        {/* Card 4: Vol Capacity */}
        <div className="bg-white p-5 rounded-2xl border border-navy-100 shadow-sm flex items-center gap-4">
          <div className="rounded-xl bg-purple-50 p-3 text-purple-600">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted tracking-wider">Volume total flotte</div>
            <div className="text-xl font-bold text-navy">{stats.totalCapacity.toFixed(1)} m³</div>
          </div>
        </div>
      </div>

      {/* Filters search */}
      <div className="bg-white p-4 rounded-2xl border border-navy-100 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${statusFilter === 'all' ? 'bg-navy text-white' : 'bg-navy-50/50 text-navy hover:bg-navy-50'}`}
          >
            Tous
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${statusFilter === 'active' ? 'bg-emerald-600 text-white' : 'bg-navy-50/50 text-navy hover:bg-navy-50'}`}
          >
            Actifs ({stats.active})
          </button>
          <button
            onClick={() => setStatusFilter('inactive')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all ${statusFilter === 'inactive' ? 'bg-slate-600 text-white' : 'bg-navy-50/50 text-navy hover:bg-navy-50'}`}
          >
            Inactifs ({stats.inactive})
          </button>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, email, téléphone..."
            className="w-full rounded-xl border border-navy-100 bg-cream-100/50 py-2.5 pl-10 pr-4 text-xs text-navy placeholder-muted focus:border-yellow focus:ring-1 focus:ring-yellow outline-none transition-all"
          />
        </div>
      </div>

      {/* Driver List Table */}
      <div className="bg-white rounded-2xl border border-navy-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-navy-50/50 border-b border-navy-100 text-navy font-display text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-bold">Livreur</th>
                <th className="px-6 py-4 font-bold">Contact</th>
                <th className="px-6 py-4 font-bold">Véhicule</th>
                <th className="px-6 py-4 font-bold">Capacité</th>
                <th className="px-6 py-4 font-bold">Statut</th>
                <th className="px-6 py-4 font-bold">Perf. / Badges</th>
                <th className="px-6 py-4 font-bold">Zones Couvertes</th>
                <th className="px-6 py-4 text-center font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-sm text-muted">
                    Aucun chauffeur trouvé.
                  </td>
                </tr>
              ) : (
                filteredDrivers.map((driver) => {
                  const snapshots = driver.driver_performance_snapshots || []
                  const latestSnapshot = snapshots.length > 0
                    ? [...snapshots].sort((a: any, b: any) => b.snapshot_date.localeCompare(a.snapshot_date))[0]
                    : null
                  const qualityScore = latestSnapshot ? Math.round(latestSnapshot.quality_score) : 100
                  const badges = driver.driver_badges || []

                  return (
                    <tr key={driver.id} className="hover:bg-cream-100/30 transition-colors">
                      {/* Name */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-navy-100 border border-navy-200 flex items-center justify-center text-navy font-bold text-sm select-none">
                            {driver.prenom?.[0] || ''}{driver.nom?.[0] || ''}
                          </div>
                          <div>
                            <div className="font-bold text-ink">
                              {driver.prenom} {driver.nom}
                            </div>
                            <span className="text-[9px] text-muted font-mono uppercase tracking-wider block">
                              Créé le {new Date(driver.created_at).toLocaleDateString('fr-FR')}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5 text-xs text-slate-700">
                          <div className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-muted shrink-0" />
                            <span className="truncate max-w-[180px]">{driver.email}</span>
                          </div>
                          {driver.telephone && (
                            <div className="flex items-center gap-1">
                              <Phone className="w-3.5 h-3.5 text-muted shrink-0" />
                              <span>{driver.telephone}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Vehicle */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {driver.vehicle_type ? (
                          <div className="flex flex-col">
                            <span className="font-bold text-navy flex items-center gap-1 uppercase text-xs">
                              <Truck className="w-3.5 h-3.5" /> {driver.vehicle_type}
                            </span>
                            {driver.vehicle_immatriculation && (
                              <span className="text-[10px] text-muted uppercase font-mono">{driver.vehicle_immatriculation}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted italic text-xs">Aucun véhicule</span>
                        )}
                      </td>

                      {/* Capacity */}
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-slate-700 text-xs">
                        {driver.vehicle_capacity_m3 ? `${driver.vehicle_capacity_m3} m³` : 'N/A'}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        {driver.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                            Actif
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
                            Inactif
                          </span>
                        )}
                      </td>

                      {/* Performance / Badges */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                              qualityScore >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/30' :
                              qualityScore >= 75 ? 'bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30' :
                              'bg-rose-50 text-rose-700 border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/30'
                            }`}>
                              Score: {qualityScore}%
                            </span>
                            {latestSnapshot && (
                              <span className="text-[9px] text-muted font-medium">
                                (R: {Math.round(latestSnapshot.success_rate)}%)
                              </span>
                            )}
                          </div>
                          {badges.length > 0 ? (
                            <div className="flex items-center gap-1 flex-wrap">
                              {badges.map((b: any) => {
                                const badgeConfig = getBadgeConfig(b.badge_key)
                                const BadgeIcon = badgeConfig.icon
                                return (
                                  <span
                                    key={b.badge_key}
                                    className={`inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-semibold border ${badgeConfig.style}`}
                                    title={badgeConfig.title}
                                  >
                                    <BadgeIcon className="w-2.5 h-2.5 shrink-0" />
                                    {badgeConfig.shortName}
                                  </span>
                                )
                              })}
                            </div>
                          ) : (
                            <span className="text-[10px] text-muted italic">Aucun badge</span>
                          )}
                        </div>
                      </td>

                      {/* Zones */}
                      <td className="px-6 py-4">
                        {driver.zones_couvertes && driver.zones_couvertes.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {driver.zones_couvertes.map((z: string) => (
                              <span key={z} className="bg-cream-100 text-navy border border-navy-50 text-[9px] font-semibold rounded px-1">
                                {z}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[10px] text-muted italic">Non défini</span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => openEdit(driver)}
                            className="rounded-lg p-2 border border-navy-100 text-navy hover:bg-navy-50 transition-all"
                            title="Modifier"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(driver)}
                            className="rounded-lg p-2 border border-red-100 text-red-600 hover:bg-red-50 hover:border-red-200 transition-all"
                            title="Supprimer"
                            disabled={submitting}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}

            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {inviteOpen && (
        <div className="fixed inset-0 z-50 bg-navy-900/40 backdrop-blur flex items-center justify-center p-4 modal-backdrop">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-navy-50 modal-dialog space-y-4">
            <div className="flex justify-between items-center border-b border-navy-50 pb-3">
              <h3 className="text-sm font-bold text-navy uppercase tracking-wider mb-0 flex items-center gap-1.5">
                <Shield className="w-5 h-5 text-navy-500" /> Inviter un Chauffeur
              </h3>
              <button onClick={() => setInviteOpen(false)} className="text-muted hover:text-navy">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="space-y-4 text-xs">
              <p className="text-muted leading-relaxed">
                Entrez les informations du nouveau chauffeur. Un email d'invitation avec un lien de connexion sécurisé lui sera envoyé.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-navy">Prénom *</label>
                  <input
                    type="text"
                    required
                    value={invitePrenom}
                    onChange={(e) => setInvitePrenom(e.target.value)}
                    placeholder="Ex. Jean"
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-navy">Nom *</label>
                  <input
                    type="text"
                    required
                    value={inviteNom}
                    onChange={(e) => setInviteNom(e.target.value)}
                    placeholder="Ex. Dupont"
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-navy">Email de connexion *</label>
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="jean.dupont@email.com"
                  className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-navy">Téléphone mobile</label>
                <input
                  type="tel"
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                  placeholder="06 12 34 56 78"
                  className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                />
              </div>

              <div className="pt-3 border-t border-navy-50 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setInviteOpen(false)}
                  className="rounded-xl border border-navy-100 hover:bg-navy-50 px-4 py-2 font-bold text-navy"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-navy hover:bg-navy-700 text-white font-bold px-4 py-2 disabled:opacity-50"
                >
                  {submitting ? 'Invitation...' : 'Envoyer invitation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editOpen && selectedDriver && (() => {
        const selectedSnapshots = selectedDriver.driver_performance_snapshots || []
        const selectedLatestSnapshot = selectedSnapshots.length > 0
          ? [...selectedSnapshots].sort((a: any, b: any) => b.snapshot_date.localeCompare(a.snapshot_date))[0]
          : null
        const selectedQualityScore = selectedLatestSnapshot ? Math.round(selectedLatestSnapshot.quality_score) : 100
        const selectedBadges = selectedDriver.driver_badges || []

        return (
          <div className="fixed inset-0 z-50 bg-navy-900/40 backdrop-blur flex items-center justify-center p-4 modal-backdrop">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-navy-50 modal-dialog space-y-4">
              <div className="flex justify-between items-center border-b border-navy-50 pb-3">
                <h3 className="text-sm font-bold text-navy uppercase tracking-wider mb-0 flex items-center gap-1.5">
                  <Truck className="w-5 h-5 text-navy-500" /> Configurer Chauffeur
                </h3>
                <button onClick={() => setEditOpen(false)} className="text-muted hover:text-navy">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4 text-xs overflow-y-auto max-h-[80dvh] pr-1">
                
                {/* Achievements Card */}
                {(selectedBadges.length > 0 || selectedSnapshots.length > 0) && (
                  <div className="bg-gradient-to-r from-navy to-navy-800 text-white rounded-xl p-4 shadow-sm border border-navy-100 flex flex-col gap-3">
                    <span className="text-[10px] text-yellow uppercase font-bold tracking-wider block">Performances & Récompenses</span>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-center bg-white/10 rounded-xl px-3 py-2 border border-white/20">
                          <div className="text-[9px] uppercase font-bold text-white/70 tracking-wider">Score Qualité</div>
                          <div className="text-xl font-bold text-yellow">{selectedQualityScore}%</div>
                        </div>
                        {selectedLatestSnapshot && (
                          <div className="text-xs text-white/80 space-y-0.5">
                            <div>📈 Ponctualité: <strong>{Math.round(selectedLatestSnapshot.on_time_rate)}%</strong></div>
                            <div>✅ Succès: <strong>{Math.round(selectedLatestSnapshot.success_rate)}%</strong></div>
                            <div>✍️ Signatures: <strong>{Math.round(selectedLatestSnapshot.signature_rate)}%</strong></div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] text-white/70 font-semibold">{selectedBadges.length} Badge{selectedBadges.length > 1 ? 's' : ''} déverrouillé{selectedBadges.length > 1 ? 's' : ''}</span>
                        <div className="flex gap-1 flex-wrap justify-end">
                          {selectedBadges.map((b: any) => {
                            const badgeConfig = getBadgeConfig(b.badge_key)
                            const BadgeIcon = badgeConfig.icon
                            return (
                              <div
                                key={b.badge_key}
                                className="w-7 h-7 rounded-full bg-white/15 border border-white/25 flex items-center justify-center text-yellow hover:scale-105 transition-transform"
                                title={badgeConfig.title}
                              >
                                <BadgeIcon className="w-4 h-4" />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-navy">Prénom</label>
                  <input
                    type="text"
                    required
                    value={editPrenom}
                    onChange={(e) => setEditPrenom(e.target.value)}
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-navy">Nom</label>
                  <input
                    type="text"
                    required
                    value={editNom}
                    onChange={(e) => setEditNom(e.target.value)}
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-navy">Téléphone</label>
                  <input
                    type="tel"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-navy">Statut en service</label>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => setEditIsActive(!editIsActive)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${editIsActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${editIsActive ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                    <span className="font-bold text-navy">{editIsActive ? 'Actif' : 'Inactif / Suspendu'}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-navy-50 pt-3 space-y-3">
                <span className="text-[10px] text-muted uppercase font-bold tracking-wider block">Fiche Véhicule</span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-navy">Catégorie</label>
                    <select
                      value={editVehicleType || ''}
                      onChange={(e) => setEditVehicleType((e.target.value as any) || null)}
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                    >
                      <option value="">Aucun</option>
                      <option value="voiture">Voiture</option>
                      <option value="utilitaire">Utilitaire (Van)</option>
                      <option value="camionnette">Camionnette</option>
                      <option value="camion">Camion</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-navy">Capacité (m³)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={editVehicleCapacity || ''}
                      onChange={(e) => setEditVehicleCapacity(parseFloat(e.target.value) || null)}
                      placeholder="Ex. 3.5"
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-navy">Immatriculation</label>
                    <input
                      type="text"
                      value={editVehicleImmat}
                      onChange={(e) => setEditVehicleImmat(e.target.value)}
                      placeholder="AA-123-BB"
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow uppercase"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-navy-50 pt-3 space-y-2">
                <label className="font-bold text-navy flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Zones de livraisons couvertes
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newZoneInput}
                    onChange={(e) => setNewZoneInput(e.target.value)}
                    placeholder="Ex. Toulouse Centre"
                    className="flex-1 rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                  <button
                    type="button"
                    onClick={addZone}
                    className="bg-navy hover:bg-navy-700 text-white font-bold rounded-xl px-4 py-2"
                  >
                    Ajouter
                  </button>
                </div>
                {editZones.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 bg-cream-100 p-3 rounded-xl border border-navy-50">
                    {editZones.map((z) => (
                      <span
                        key={z}
                        className="inline-flex items-center gap-1 bg-white text-navy border border-navy-100 rounded-lg px-2.5 py-1 font-bold text-[10px]"
                      >
                        {z}
                        <button
                          type="button"
                          onClick={() => removeZone(z)}
                          className="text-muted hover:text-red-500 shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-navy-50 flex justify-between gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (window.confirm(`Envoyer un e-mail de réinitialisation de mot de passe à ${selectedDriver.email} ?`)) {
                      setSubmitting(true)
                      const res = await resetDriverPasswordAction(selectedDriver.email)
                      setSubmitting(false)
                      if (res.success) {
                        alert('E-mail de réinitialisation envoyé avec succès !')
                      } else {
                        alert(`Erreur : ${res.error}`)
                      }
                    }
                  }}
                  disabled={submitting || !selectedDriver.email}
                  className="rounded-xl border border-yellow bg-yellow/5 hover:bg-yellow text-navy px-4 py-2 font-bold transition-all disabled:opacity-50"
                >
                  Réinitialiser mot de passe
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditOpen(false)}
                    className="rounded-xl border border-navy-100 hover:bg-navy-50 px-4 py-2 font-bold text-navy"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-xl bg-navy hover:bg-navy-700 text-white font-bold px-4 py-2 disabled:opacity-50"
                  >
                    {submitting ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )})()}
    </div>
  )
}
