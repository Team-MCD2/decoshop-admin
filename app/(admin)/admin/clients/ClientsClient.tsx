'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import {
  Search,
  Plus,
  Edit2,
  Mail,
  Phone,
  MapPin,
  X,
  Users,
  Compass,
  ShoppingBag,
  Info,
  Calendar,
  Globe
} from 'lucide-react'

export default function ClientsClient({ initialClients }: { initialClients: any[] }) {
  const router = useRouter()
  const supabase = createClient()
  const { locale } = useI18n()

  const [clients, setClients] = useState<any[]>(initialClients)
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)

  // Sync state with server side refreshes
  useMemo(() => {
    setClients(initialClients)
  }, [initialClients])

  // Modals state
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<any | null>(null)

  // Form states - Create / Edit
  const [nom, setNom] = useState('')
  const [prenom, setPrenom] = useState('')
  const [email, setEmail] = useState('')
  const [telephone, setTelephone] = useState('')
  const [adresse1, setAdresse1] = useState('')
  const [adresse2, setAdresse2] = useState('')
  const [zip, setZip] = useState('')
  const [ville, setVille] = useState('')
  const [pays, setPays] = useState('France')
  const [lat, setLat] = useState<number | ''>('')
  const [lng, setLng] = useState<number | ''>('')
  const [etage, setEtage] = useState<number | ''>('')
  const [ascenseur, setAscenseur] = useState(false)
  const [codePorte, setCodePorte] = useState('')
  const [commentAcc, setCommentAcc] = useState('')

  // Search logic
  const filteredClients = useMemo(() => {
    return clients.filter((c) => {
      const q = search.toLowerCase()
      const matchName = `${c.prenom || ''} ${c.nom || ''}`.toLowerCase().includes(q)
      const matchEmail = (c.email || '').toLowerCase().includes(q)
      const matchPhone = (c.telephone || '').includes(q)
      const matchCity = (c.ville || '').toLowerCase().includes(q)
      return matchName || matchEmail || matchPhone || matchCity
    })
  }, [clients, search])

  // Stats summaries
  const stats = useMemo(() => {
    const total = clients.length
    const cities = new Set(clients.map(c => c.ville).filter(Boolean)).size
    const shopifyLinked = clients.filter(c => c.shopify_customer_id).length
    const manualCreated = total - shopifyLinked
    return { total, cities, shopifyLinked, manualCreated }
  }, [clients])

  const handleOpenCreate = () => {
    setNom('')
    setPrenom('')
    setEmail('')
    setTelephone('')
    setAdresse1('')
    setAdresse2('')
    setZip('')
    setVille('')
    setPays('France')
    setLat('')
    setLng('')
    setEtage('')
    setAscenseur(false)
    setCodePorte('')
    setCommentAcc('')
    setCreateOpen(true)
  }

  const handleOpenEdit = (client: any) => {
    setSelectedClient(client)
    setNom(client.nom || '')
    setPrenom(client.prenom || '')
    setEmail(client.email || '')
    setTelephone(client.telephone || '')
    setAdresse1(client.adresse_ligne1 || '')
    setAdresse2(client.adresse_ligne2 || '')
    setZip(client.code_postal || '')
    setVille(client.ville || '')
    setPays(client.pays || 'France')
    setLat(client.latitude != null ? Number(client.latitude) : '')
    setLng(client.longitude != null ? Number(client.longitude) : '')
    setEtage(client.etage != null ? Number(client.etage) : '')
    setAscenseur(!!client.ascenseur)
    setCodePorte(client.code_porte || '')
    setCommentAcc(client.commentaire_acces || '')
    setEditOpen(true)
  }

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nom || !adresse1) {
      alert('Nom et Adresse 1 sont obligatoires.')
      return
    }
    setSaving(true)
    try {
      const { error } = await supabase
        .from('clients')
        .insert({
          nom,
          prenom: prenom || null,
          email: email || null,
          telephone: telephone || null,
          adresse_ligne1: adresse1,
          adresse_ligne2: adresse2 || null,
          code_postal: zip || null,
          ville: ville || null,
          pays,
          latitude: lat !== '' ? lat : null,
          longitude: lng !== '' ? lng : null,
          etage: etage !== '' ? etage : null,
          ascenseur,
          code_porte: codePorte || null,
          commentaire_acces: commentAcc || null
        })

      if (error) throw error

      alert('Client créé avec succès !')
      setCreateOpen(false)
      router.refresh()
    } catch (err: any) {
      console.error(err)
      alert('Erreur lors de la création : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClient) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('clients')
        .update({
          nom,
          prenom: prenom || null,
          email: email || null,
          telephone: telephone || null,
          adresse_ligne1: adresse1,
          adresse_ligne2: adresse2 || null,
          code_postal: zip || null,
          ville: ville || null,
          pays,
          latitude: lat !== '' ? lat : null,
          longitude: lng !== '' ? lng : null,
          etage: etage !== '' ? etage : null,
          ascenseur,
          code_porte: codePorte || null,
          commentaire_acces: commentAcc || null
        })
        .eq('id', selectedClient.id)

      if (error) throw error

      alert('Fiche client mise à jour !')
      setEditOpen(false)
      router.refresh()
    } catch (err: any) {
      console.error(err)
      alert('Erreur lors de la mise à jour : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold font-display text-navy mb-0">Répertoire Clients</h1>
          <p className="text-xs text-muted">Consultez l'historique d'adresses, coordonnées géocodées et codes d'accès porte.</p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="rounded-xl bg-navy hover:bg-navy-700 text-white font-bold px-4 py-2.5 text-xs transition-all shadow-sm flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4 text-navy-200" />
          Ajouter un client
        </button>
      </div>

      {/* KPI statistics cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total */}
        <div className="bg-white p-5 rounded-2xl border border-navy-100 shadow-sm flex items-center gap-4">
          <div className="rounded-xl bg-navy-50 p-3 text-navy">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted tracking-wider">Total Clients</div>
            <div className="text-xl font-bold text-navy">{stats.total}</div>
          </div>
        </div>

        {/* Card 2: Distinct Cities */}
        <div className="bg-white p-5 rounded-2xl border border-navy-100 shadow-sm flex items-center gap-4">
          <div className="rounded-xl bg-purple-50 p-3 text-purple-600">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted tracking-wider">Villes desservies</div>
            <div className="text-xl font-bold text-navy">{stats.cities}</div>
          </div>
        </div>

        {/* Card 3: Shopify Linked */}
        <div className="bg-white p-5 rounded-2xl border border-navy-100 shadow-sm flex items-center gap-4">
          <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted tracking-wider">Sync Shopify</div>
            <div className="text-xl font-bold text-navy">{stats.shopifyLinked}</div>
          </div>
        </div>

        {/* Card 4: Manual entries */}
        <div className="bg-white p-5 rounded-2xl border border-navy-100 shadow-sm flex items-center gap-4">
          <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted tracking-wider">Saisies manuelles</div>
            <div className="text-xl font-bold text-navy">{stats.manualCreated}</div>
          </div>
        </div>
      </div>

      {/* Filters Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-navy-100 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="text-xs font-bold text-navy uppercase tracking-wide">
          Liste des clients ({filteredClients.length})
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, ville, email..."
            className="w-full rounded-xl border border-navy-100 bg-cream-100/50 py-2.5 pl-10 pr-4 text-xs text-navy placeholder-muted focus:border-yellow focus:ring-1 focus:ring-yellow outline-none transition-all"
          />
        </div>
      </div>

      {/* Clients directory Table */}
      <div className="bg-white rounded-2xl border border-navy-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-navy-50/50 border-b border-navy-100 text-navy font-display text-xs uppercase tracking-wider">
                <th className="px-6 py-4 font-bold">Client</th>
                <th className="px-6 py-4 font-bold">Coordonnées de contact</th>
                <th className="px-6 py-4 font-bold">Adresse</th>
                <th className="px-6 py-4 font-bold">Ville</th>
                <th className="px-6 py-4 font-bold">Détails d'accès</th>
                <th className="px-6 py-4 font-bold">Source</th>
                <th className="px-6 py-4 text-center font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-sm text-muted">
                    Aucun client enregistré.
                  </td>
                </tr>
              ) : (
                filteredClients.map((client) => (
                  <tr key={client.id} className="hover:bg-cream-100/30 transition-colors">
                    {/* Name */}
                    <td className="px-6 py-4 whitespace-nowrap font-bold text-ink">
                      {client.prenom} {client.nom}
                    </td>

                    {/* Contacts */}
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-0.5 text-xs text-slate-700">
                        {client.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5 text-muted" />
                            {client.email}
                          </span>
                        )}
                        {client.telephone && (
                          <span className="flex items-center gap-1 font-medium">
                            <Phone className="w-3.5 h-3.5 text-muted" />
                            {client.telephone}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Address */}
                    <td className="px-6 py-4 text-xs font-medium text-slate-700 max-w-[200px] truncate">
                      {client.adresse_ligne1}
                      {client.adresse_ligne2 && <span className="text-muted block text-[10px] truncate">{client.adresse_ligne2}</span>}
                    </td>

                    {/* Ville */}
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-semibold">
                      {client.code_postal} {client.ville}
                    </td>

                    {/* Access notes */}
                    <td className="px-6 py-4 text-xs max-w-[220px]">
                      <div className="space-y-0.5">
                        {(client.etage != null || client.code_porte) && (
                          <div className="font-bold text-navy text-[10px]">
                            {client.etage != null ? `Étage ${client.etage} ` : ''}
                            {client.ascenseur ? '(Ascenseur) ' : ''}
                            {client.code_porte ? `· Code: ${client.code_porte}` : ''}
                          </div>
                        )}
                        {client.commentaire_acces && (
                          <div className="text-[10px] text-muted italic truncate leading-tight">
                            « {client.commentaire_acces} »
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Source flag */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      {client.shopify_customer_id ? (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600 bg-emerald-50 border border-emerald-100 rounded px-1 py-0.5">
                          Shopify
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-amber-600 bg-amber-50 border border-amber-100 rounded px-1 py-0.5">
                          Manuel
                        </span>
                      )}
                    </td>

                    {/* Actions button */}
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <button
                        onClick={() => handleOpenEdit(client)}
                        className="rounded-lg p-2 border border-navy-100 text-navy hover:bg-navy-50 transition-all"
                        title="Modifier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create Client Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-navy-900/40 backdrop-blur flex items-center justify-center p-4 modal-backdrop">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-navy-50 modal-dialog space-y-4">
            <div className="flex justify-between items-center border-b border-navy-50 pb-3">
              <h3 className="text-sm font-bold text-navy uppercase tracking-wider mb-0 flex items-center gap-1.5">
                <Plus className="w-5 h-5 text-navy-500" /> Nouveau Client
              </h3>
              <button onClick={() => setCreateOpen(false)} className="text-muted hover:text-navy">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs overflow-y-auto max-h-[75dvh] pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-navy">Prénom</label>
                  <input
                    type="text"
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    placeholder="Jean"
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-navy">Nom *</label>
                  <input
                    type="text"
                    required
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    placeholder="Dupont"
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-navy">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="client@mail.com"
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-navy">Téléphone</label>
                  <input
                    type="tel"
                    value={telephone}
                    onChange={(e) => setTelephone(e.target.value)}
                    placeholder="06 00 00 00 00"
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
              </div>

              <div className="border-t border-navy-50 pt-3 space-y-3">
                <span className="text-[10px] text-muted uppercase font-bold tracking-wider block">Adresse postale</span>
                <div className="space-y-1">
                  <label className="font-bold text-navy">Ligne 1 *</label>
                  <input
                    type="text"
                    required
                    value={adresse1}
                    onChange={(e) => setAdresse1(e.target.value)}
                    placeholder="12 rue des Fleurs"
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-navy">Ligne 2 (Complément, Résidence...)</label>
                  <input
                    type="text"
                    value={adresse2}
                    onChange={(e) => setAdresse2(e.target.value)}
                    placeholder="Bâtiment B, Apt 4"
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-navy">Code Postal</label>
                    <input
                      type="text"
                      value={zip}
                      onChange={(e) => setZip(e.target.value)}
                      placeholder="31000"
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-navy">Ville</label>
                    <input
                      type="text"
                      value={ville}
                      onChange={(e) => setVille(e.target.value)}
                      placeholder="Toulouse"
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-navy">Pays</label>
                    <input
                      type="text"
                      value={pays}
                      onChange={(e) => setPays(e.target.value)}
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-navy-50 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="rounded-xl border border-navy-100 hover:bg-navy-50 px-4 py-2 font-bold text-navy"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-navy hover:bg-navy-700 text-white font-bold px-4 py-2 disabled:opacity-50"
                >
                  {saving ? 'Création...' : 'Créer Client'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      {editOpen && selectedClient && (
        <div className="fixed inset-0 z-50 bg-navy-900/40 backdrop-blur flex items-center justify-center p-4 modal-backdrop">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-navy-50 modal-dialog space-y-4">
            <div className="flex justify-between items-center border-b border-navy-50 pb-3">
              <h3 className="text-sm font-bold text-navy uppercase tracking-wider mb-0 flex items-center gap-1.5">
                <Edit2 className="w-5 h-5 text-navy-500" /> Éditer Fiche Client
              </h3>
              <button onClick={() => setEditOpen(false)} className="text-muted hover:text-navy">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs overflow-y-auto max-h-[75dvh] pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-navy">Prénom</label>
                  <input
                    type="text"
                    value={prenom}
                    onChange={(e) => setPrenom(e.target.value)}
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-navy">Nom *</label>
                  <input
                    type="text"
                    required
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-navy">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-navy">Téléphone</label>
                  <input
                    type="tel"
                    value={telephone}
                    onChange={(e) => setTelephone(e.target.value)}
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
              </div>

              <div className="border-t border-navy-50 pt-3 space-y-3">
                <span className="text-[10px] text-muted uppercase font-bold tracking-wider block">Adresse postale</span>
                <div className="space-y-1">
                  <label className="font-bold text-navy">Ligne 1 *</label>
                  <input
                    type="text"
                    required
                    value={adresse1}
                    onChange={(e) => setAdresse1(e.target.value)}
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-navy">Ligne 2</label>
                  <input
                    type="text"
                    value={adresse2}
                    onChange={(e) => setAdresse2(e.target.value)}
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-navy">Code Postal</label>
                    <input
                      type="text"
                      value={zip}
                      onChange={(e) => setZip(e.target.value)}
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-navy">Ville</label>
                    <input
                      type="text"
                      value={ville}
                      onChange={(e) => setVille(e.target.value)}
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-navy">Pays</label>
                    <input
                      type="text"
                      value={pays}
                      onChange={(e) => setPays(e.target.value)}
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-navy-50 pt-3 space-y-3">
                <span className="text-[10px] text-muted uppercase font-bold tracking-wider block">Spécificités d'accès & Coordonnées</span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-navy">Étage</label>
                    <input
                      type="number"
                      value={etage}
                      onChange={(e) => setEtage(e.target.value !== '' ? parseInt(e.target.value) : '')}
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-navy">Ascenseur</label>
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="checkbox"
                        checked={ascenseur}
                        onChange={(e) => setAscenseur(e.target.checked)}
                        className="h-4 w-4 rounded border-navy-200 text-navy focus:ring-yellow cursor-pointer"
                      />
                      <span className="font-semibold text-slate-700">Oui</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-navy">Code Porte</label>
                    <input
                      type="text"
                      value={codePorte}
                      onChange={(e) => setCodePorte(e.target.value)}
                      placeholder="Ex. 14A5"
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-navy flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-muted" /> Latitude
                    </label>
                    <input
                      type="number"
                      step="0.0000001"
                      value={lat}
                      onChange={(e) => setLat(e.target.value !== '' ? parseFloat(e.target.value) : '')}
                      placeholder="Ex. 43.604"
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="font-bold text-navy flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-muted" /> Longitude
                    </label>
                    <input
                      type="number"
                      step="0.0000001"
                      value={lng}
                      onChange={(e) => setLng(e.target.value !== '' ? parseFloat(e.target.value) : '')}
                      placeholder="Ex. 1.444"
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-navy">Instructions d'accès particulières</label>
                  <textarea
                    value={commentAcc}
                    onChange={(e) => setCommentAcc(e.target.value)}
                    rows={2}
                    placeholder="Ex. Sonner chez le gardien, bâtiment au fond du parking."
                    className="w-full rounded-xl border border-navy-100 bg-cream-100/50 p-2.5 outline-none focus:ring-1 focus:ring-yellow resize-none"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-navy-50 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-xl border border-navy-100 hover:bg-navy-50 px-4 py-2 font-bold text-navy"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-navy hover:bg-navy-700 text-white font-bold px-4 py-2 disabled:opacity-50"
                >
                  {saving ? 'Enregistrement...' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
