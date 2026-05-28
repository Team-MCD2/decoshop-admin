'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { createManualOrderAction, getUnfulfilledShopifyOrdersAction, createBlFromShopifyOrderAction, getShopifyOrderLineItemsAction } from './actions'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  Search,
  Download,
  Printer,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Plus,
  X,
  Calendar,
  Truck,
  FileText,
  Trash2,
  DollarSign
} from 'lucide-react'

// All BL statuses from db ENUM
const BL_STATUSES = [
  'cree', 'assigne', 'confirme', 'release_demandee', 'bloque',
  'en_livraison', 'en_route', 'livre', 'signature_attendue', 'signe',
  'signature_expiree', 'echec_T1', 'echec_T2', 'abandon',
  'retour_planifie', 'retour_en_cours', 'retour_collecte'
]

const STATUS_LABELS: Record<string, string> = {
  cree: 'Créé',
  assigne: 'Assigné',
  confirme: 'Confirmé',
  release_demandee: 'Relâche demandée',
  bloque: 'Bloqué',
  en_livraison: 'En livraison',
  en_route: 'En route',
  livre: 'Livré',
  signature_attendue: 'Signature en attente',
  signe: 'Signé',
  signature_expiree: 'Signature expirée',
  echec_T1: 'Échec T1',
  echec_T2: 'Échec T2',
  abandon: 'Abandonné',
  retour_planifie: 'Retour planifié',
  retour_en_cours: 'Retour en cours',
  retour_collecte: 'Retour collecté'
}

export default function BonsLivraisonClient({
  initialBLs,
  drivers
}: {
  initialBLs: any[]
  drivers: any[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Page state
  const [bls, setBLs] = useState<any[]>(initialBLs)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  // Loading/Saving states
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  // Selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Refresh datasets from server
  const handleRefresh = async () => {
    setRefreshing(true)
    const { data: latestBLs } = await supabase
      .from('bons_livraison')
      .select('*, clients(*), commandes(*), livreur:profiles!bons_livraison_livreur_id_fkey(id, nom, prenom)')
      .order('created_at', { ascending: false })

    if (latestBLs) {
      setBLs(latestBLs)
    }
    setRefreshing(false)
  }

  // --- Filtering ---
  const filteredBLs = useMemo(() => {
    return bls.filter((bl) => {
      if (statusFilter !== 'all' && bl.statut !== statusFilter) return false

      if (search) {
        const q = search.toLowerCase()
        const matchNum = bl.numero_bl.toLowerCase().includes(q)
        const matchName = `${bl.clients?.prenom || ''} ${bl.clients?.nom || ''}`.toLowerCase().includes(q)
        const matchEmail = bl.clients?.email?.toLowerCase().includes(q)
        
        if (!matchNum && !matchName && !matchEmail) return false
      }

      return true
    })
  }, [bls, statusFilter, search])

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(filteredBLs.length / perPage))
  const paginatedBLs = useMemo(() => {
    const start = (page - 1) * perPage
    return filteredBLs.slice(start, start + perPage)
  }, [filteredBLs, page, perPage])

  const handlePerPageChange = (val: number) => {
    setPerPage(val)
    setPage(1)
  }

  // --- Row Selectors ---
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllPage = () => {
    const pageIds = paginatedBLs.map((b) => b.id)
    const allSelected = pageIds.every((id) => selectedIds.has(id))
    
    setSelectedIds((prev) => {
      const next = new Set(prev)
      pageIds.forEach((id) => {
        if (allSelected) next.delete(id)
        else next.add(id)
      })
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const isAllPageSelected = paginatedBLs.length > 0 && paginatedBLs.every(b => selectedIds.has(b.id))
  const isSomePageSelected = paginatedBLs.some(b => selectedIds.has(b.id)) && !isAllPageSelected

  // --- Mutations (Updates) ---
  const handleUpdateBL = async (blId: string, patch: Record<string, any>) => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('bons_livraison')
        .update(patch)
        .eq('id', blId)

      if (error) throw error

      // Update local state directly to feel instant
      setBLs(prev => prev.map(bl => {
        if (bl.id === blId) {
          const updated = { ...bl, ...patch }
          // Resolve driver name if driver was changed
          if (patch.livreur_id !== undefined) {
            const driverInfo = drivers.find(d => d.id === patch.livreur_id)
            updated.livreur = driverInfo ? { id: driverInfo.id, nom: driverInfo.nom, prenom: driverInfo.prenom } : null
          }
          return updated
        }
        return bl
      }))

    } catch (err: any) {
      console.error('Failed to update BL:', err)
      alert('Erreur lors de la mise à jour : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleBulkStatusChange = async (newStatus: string) => {
    if (!newStatus || selectedIds.size === 0) return
    
    setSaving(true)
    let success = 0
    let failed = 0

    for (const id of Array.from(selectedIds)) {
      try {
        const { error } = await supabase
          .from('bons_livraison')
          .update({ statut: newStatus })
          .eq('id', id)

        if (error) throw error
        success++
      } catch (err) {
        console.error('Bulk update error on BL:', id, err)
        failed++
      }
    }

    setSaving(false)
    clearSelection()
    alert(`Statut mis à jour pour ${success} bons de livraison.${failed > 0 ? ` Échecs: ${failed}.` : ''}`)
    handleRefresh()
  }

  // --- PDF Recap ---
  const handlePrintBL = async (bl: any) => {
    let lines = bl.lignes_bl
    if (!lines) {
      const { data, error } = await supabase
        .from('lignes_bl')
        .select('*')
        .eq('bl_id', bl.id)
        .order('ordre_tri', { ascending: true })
      
      if (error) {
        console.error('Failed to load BL line items for PDF:', error)
        alert("Erreur lors de la récupération des articles du bon de livraison.")
        return
      }
      lines = data || []
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const now = new Date()

    // Title / Header
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.setTextColor(30, 58, 138) // Navy
    doc.text('BON DE LIVRAISON', 14, 20)

    doc.setFontSize(10)
    doc.setTextColor(100, 100, 100)
    doc.text(`Émis le: ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')}`, 14, 26)

    // Invoice Details Table
    const detailsHead = [['Bon de livraison', 'Commande', 'Statut', 'Date prévue', 'Créneau']]
    const detailsBody = [[
      bl.numero_bl,
      bl.commandes?.numero_commande || 'N/A',
      STATUS_LABELS[bl.statut] || bl.statut,
      bl.date_livraison_prevue ? new Date(bl.date_livraison_prevue).toLocaleDateString('fr-FR') : 'Non planifiée',
      bl.creneau || 'Non planifié'
    ]]

    autoTable(doc, {
      startY: 32,
      head: detailsHead,
      body: detailsBody,
      theme: 'grid',
      headStyles: { fillColor: [30, 58, 138] },
    })

    // Client box
    const clientY = (doc as any).lastAutoTable.finalY + 10
    doc.rect(14, clientY, 182, 32)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(30, 58, 138)
    doc.text('DESTINATAIRE & ADRESSE DE LIVRAISON', 18, clientY + 6)
    
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(15, 23, 42)
    doc.text(`Client : ${bl.clients?.prenom || ''} ${bl.clients?.nom || ''}`, 18, clientY + 13)
    doc.text(`Adresse : ${bl.clients?.adresse_ligne1 || 'Non renseignée'}`, 18, clientY + 19)
    doc.text(`Contact : ${bl.clients?.telephone || 'Pas de numéro'} &bull; ${bl.clients?.email || 'Pas d\'email'}`, 18, clientY + 25)

    // Items table
    const itemsHead = [['Article', 'Quantité', 'Prix Unitaire', 'Total HT', 'Total TTC']]
    const itemsBody = lines.map((item: any) => [
      item.designation,
      String(item.quantite),
      Number(item.prix_unitaire_ttc).toFixed(2) + ' €',
      Number(item.quantite * item.prix_unitaire_ttc * 0.8).toFixed(2) + ' €',
      Number(item.quantite * item.prix_unitaire_ttc).toFixed(2) + ' €',
    ])

    autoTable(doc, {
      startY: clientY + 45,
      head: itemsHead,
      body: itemsBody,
      theme: 'striped',
      headStyles: { fillColor: [30, 58, 138] },
    })

    // Sum details
    const totalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(30, 58, 138)
    
    // Format amounts
    const baseTotal = Number(bl.montant_total_ttc || 0)
    const fees = Number(bl.montant_frais_relivraison || 0)
    const finalTotal = baseTotal + fees

    doc.text(`Total Articles : ${baseTotal.toFixed(2)} €`, 130, totalY)
    if (fees > 0) {
      doc.text(`Frais Relivraison (5%) : ${fees.toFixed(2)} €`, 130, totalY + 6)
    }
    doc.setFontSize(13)
    doc.text(`NET À PAYER : ${finalTotal.toFixed(2)} €`, 130, totalY + 14)

    // Signatures
    const sigY = totalY + 30
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)
    doc.line(14, sigY, 80, sigY)
    doc.text('Signature Expéditeur', 30, sigY + 5)

    doc.line(120, sigY, 196, sigY)
    doc.text('Signature Client', 145, sigY + 5)

    // Save
    doc.save(`decoshop-bl-${bl.numero_bl}.pdf`)
  }

  // --- CSV Export ---
  const handleExportCSV = () => {
    const headers = ['N° BL', 'Commande', 'Client', 'Statut', 'Livreur', 'Mode', 'Créneau', 'Date Prévue', 'Montant TTC']
    const rows = filteredBLs.map(b => [
      b.numero_bl,
      b.commandes?.numero_commande || '',
      b.clients ? `${b.clients.prenom} ${b.clients.nom}` : '',
      STATUS_LABELS[b.statut] || b.statut,
      b.livreur ? `${b.livreur.prenom} ${b.livreur.nom}` : 'Non assigné',
      b.mode_livraison,
      b.creneau || '',
      b.date_livraison_prevue || '',
      String(b.montant_total_ttc),
    ])

    const delimiter = ';'
    const csvContent = [
      headers.join(delimiter),
      ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(delimiter))
    ].join('\r\n')

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `decoshop-bl-export-${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Styles based on status
  const badgeStyles = (status: string) => {
    switch (status) {
      case 'signe':
      case 'livre':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'en_route':
      case 'en_livraison':
        return 'bg-blue-50 text-blue-700 border-blue-200 font-bold'
      case 'cree':
        return 'bg-gray-50 text-gray-700 border-gray-200'
      case 'echec_T1':
      case 'echec_T2':
      case 'bloque':
        return 'bg-red-50 text-red-700 border-red-200'
      case 'confirme':
        return 'bg-yellow-50 text-yellow-800 border-yellow-200'
      default:
        return 'bg-navy-50 text-navy-600 border-navy-100'
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold font-display text-navy mb-0">Bons de livraison</h1>
          <p className="text-xs text-muted">Supervision des tournées, assignation des chauffeurs et planification.</p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Refresh */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-xl border border-navy-200 p-2.5 bg-white text-navy hover:bg-navy-50 disabled:opacity-50 transition-colors shadow-sm"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            className="rounded-xl border border-navy-200 p-2.5 bg-white text-navy hover:bg-navy-50 transition-colors shadow-sm flex items-center gap-2 text-xs font-bold"
            title="Exporter CSV"
          >
            <Download className="w-4 h-4" /> CSV
          </button>

          {/* Create Manual BL Button */}
          <button
            onClick={() => setCreateOpen(true)}
            className="rounded-xl bg-navy hover:bg-navy-700 text-white font-bold px-4 py-2.5 text-xs transition-all shadow-sm flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-navy-200" />
            Créer un BL
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-navy-100 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-navy-100 bg-navy-50 text-navy font-bold text-xs uppercase px-4 py-2 outline-none focus:ring-1 focus:ring-yellow"
          >
            <option value="all">Tous les statuts</option>
            {BL_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
            ))}
          </select>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par N° BL, nom client..."
            className="w-full rounded-xl border border-navy-100 bg-cream-100/50 py-2.5 pl-10 pr-4 text-xs text-navy placeholder-muted focus:border-yellow focus:ring-1 focus:ring-yellow outline-none transition-all"
          />
        </div>
      </div>

      {/* Bulk action sticky ribbon */}
      {selectedIds.size > 0 && (
        <div className="sticky top-4 z-30 rounded-xl bg-navy text-white px-5 py-3 flex items-center justify-between shadow-lg animate-slide-in-top border border-navy-700">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-yellow text-navy font-black text-xs">
              {selectedIds.size}
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-navy-100">
              Bon{selectedIds.size > 1 ? 's' : ''} de livraison sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <select
              onChange={(e) => handleBulkStatusChange(e.target.value)}
              disabled={saving}
              className="rounded-lg border border-navy-800 bg-navy-900 text-white px-3 py-1.5 text-xs font-bold outline-none focus:border-yellow"
            >
              <option value="">Changer statut...</option>
              {BL_STATUSES.map((s) => (
                <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
              ))}
            </select>
            <button
              onClick={clearSelection}
              className="rounded-lg bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 text-xs transition-all"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* BL Table Card */}
      <div className="bg-white rounded-2xl border border-navy-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse">
            <thead>
              <tr className="bg-navy-50/50 border-b border-navy-100 text-navy font-display text-xs uppercase tracking-wider">
                <th className="w-12 px-6 py-4">
                  <input
                    type="checkbox"
                    checked={isAllPageSelected}
                    ref={(el) => { if (el) el.indeterminate = isSomePageSelected }}
                    onChange={toggleSelectAllPage}
                    className="h-4 w-4 rounded border-navy-200 text-navy focus:ring-yellow cursor-pointer"
                  />
                </th>
                <th className="px-6 py-4 font-bold">N° BL</th>
                <th className="px-6 py-4 font-bold">Client / Commande</th>
                <th className="px-6 py-4 font-bold">Planification</th>
                <th className="px-6 py-4 font-bold">Montant</th>
                <th className="px-6 py-4 font-bold">Statut</th>
                <th className="px-6 py-4 font-bold">Livreur</th>
                <th className="px-6 py-4 text-center font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {paginatedBLs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-sm text-muted">
                    Aucun bon de livraison trouvé.
                  </td>
                </tr>
              ) : (
                paginatedBLs.map((bl) => {
                  const isSelected = selectedIds.has(bl.id)
                  return (
                    <tr
                      key={bl.id}
                      className={`hover:bg-cream-100/40 transition-colors ${
                        isSelected ? 'bg-yellow/5' : ''
                      }`}
                    >
                      {/* Selection Box */}
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(bl.id)}
                          className="h-4 w-4 rounded border-navy-200 text-navy focus:ring-yellow cursor-pointer"
                        />
                      </td>

                      {/* BL Number */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Link href={`/admin/bons-livraison/${bl.id}`} className="font-bold text-navy hover:underline">
                          {bl.numero_bl}
                        </Link>
                      </td>

                      {/* Client & Commande info */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-ink">
                            {bl.clients?.prenom} {bl.clients?.nom}
                          </span>
                          <span className="text-[10px] text-muted font-mono uppercase">
                            CMD: {bl.commandes?.numero_commande || 'MANUELLE'}
                          </span>
                        </div>
                      </td>

                      {/* Slot / Plannification details */}
                      <td className="px-6 py-4">
                        <div className="flex flex-col text-xs gap-1">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-navy-500 shrink-0" />
                            <input
                              type="date"
                              value={bl.date_livraison_prevue || ''}
                              onChange={(e) => handleUpdateBL(bl.id, { date_livraison_prevue: e.target.value || null })}
                              className="rounded border border-navy-100 bg-navy-50/50 px-1 py-0.5 font-bold outline-none text-navy"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-muted uppercase">Créneau:</span>
                            <select
                              value={bl.creneau || ''}
                              onChange={(e) => handleUpdateBL(bl.id, { creneau: e.target.value || null })}
                              className="rounded border border-navy-100 bg-navy-50/50 px-1 py-0.5 font-bold outline-none text-navy"
                            >
                              <option value="">—</option>
                              <option value="matin">Matin (9h-12h)</option>
                              <option value="apres_midi">Après-midi (14h-18h)</option>
                              <option value="soir">Soir (18h-20h)</option>
                            </select>
                          </div>
                        </div>
                      </td>

                      {/* Total Amount */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-bold text-navy">
                            {Number(bl.montant_total_ttc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                          </span>
                          {bl.montant_frais_relivraison > 0 && (
                            <span className="text-[9px] font-black text-red-600 bg-red-50 border border-red-100 rounded px-1 self-start mt-0.5">
                              Relivraison: +{Number(bl.montant_frais_relivraison).toFixed(2)} €
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status select change */}
                      <td className="px-6 py-4">
                        <select
                          value={bl.statut}
                          onChange={(e) => handleUpdateBL(bl.id, { statut: e.target.value })}
                          disabled={saving}
                          className={`rounded-xl border px-3 py-1.5 text-xs font-bold uppercase outline-none focus:ring-1 focus:ring-yellow cursor-pointer ${badgeStyles(bl.statut)}`}
                        >
                          {BL_STATUSES.map((s) => (
                            <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                          ))}
                        </select>
                      </td>

                      {/* Assign Driver select */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-navy-500 shrink-0" />
                          <select
                            value={bl.livreur_id || ''}
                            onChange={(e) => handleUpdateBL(bl.id, { livreur_id: e.target.value || null, statut: e.target.value ? 'assigne' : 'cree' })}
                            disabled={saving}
                            className="rounded-xl border border-navy-100 bg-navy-50/50 text-navy text-xs font-semibold px-2 py-1.5 outline-none focus:border-yellow"
                          >
                            <option value="">Non assigné</option>
                            {drivers.map((drv) => (
                              <option key={drv.id} value={drv.id}>{drv.prenom} {drv.nom}</option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* Print PDF / Recaps */}
                      <td className="px-6 py-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1.5">
                          <Link
                            href={`/admin/bons-livraison/${bl.id}`}
                            className="rounded-lg border border-navy-100 hover:bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy transition-all"
                          >
                            Gérer
                          </Link>
                          <button
                            onClick={() => handlePrintBL(bl)}
                            className="rounded-lg p-2 border border-navy-100 text-navy hover:bg-navy-50 hover:text-navy transition-all"
                            title="Imprimer"
                          >
                            <Printer className="w-4 h-4" />
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

        {/* Pagination navigation */}
        {filteredBLs.length > 0 && (
          <div className="bg-navy-50/20 border-t border-navy-100 px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between text-xs text-muted">
            <div className="flex items-center gap-4">
              <span>
                Affichage de <strong>{Math.min(filteredBLs.length, (page - 1) * perPage + 1)}</strong> à{' '}
                <strong>{Math.min(filteredBLs.length, page * perPage)}</strong> sur{' '}
                <strong>{filteredBLs.length}</strong> bons de livraison
              </span>

              <select
                value={perPage}
                onChange={(e) => handlePerPageChange(Number(e.target.value))}
                className="rounded-lg border border-navy-100 bg-white px-2 py-1 outline-none focus:border-yellow text-navy"
              >
                <option value={10}>10 par page</option>
                <option value={25}>25 par page</option>
                <option value={50}>50 par page</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-navy-100 p-2 bg-white hover:bg-navy-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-navy" />
              </button>
              <span className="px-3 py-1.5 font-semibold text-navy">
                Page {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-navy-100 p-2 bg-white hover:bg-navy-50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-navy" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Creation modal */}
      {createOpen && (
        <CreateBlModal
          drivers={drivers}
          saving={saving}
          onClose={() => setCreateOpen(false)}
          onSave={async (formData) => {
            setSaving(true)
            try {
              let res
              if (formData.is_import) {
                res = await createBlFromShopifyOrderAction(formData)
              } else {
                res = await createManualOrderAction(formData)
              }

              if (res.success) {
                setCreateOpen(false)
                alert(`Bon de livraison créé avec succès ! Numéro : ${res.numero_bl}`)
                handleRefresh()
              } else {
                alert(res.error || 'Erreur lors de la création.')
              }
            } catch (err: any) {
              console.error('Failed to create BL:', err)
              alert('Erreur lors de la création : ' + err.message)
            } finally {
              setSaving(false)
            }
          }}
        />
      )}

    </div>
  )
}

// --- Create BL Modal helper component ---
function CreateBlModal({
  drivers,
  saving,
  onClose,
  onSave,
}: {
  drivers: any[]
  saving: boolean
  onClose: () => void
  onSave: (data: any) => void
}) {
  const [mode, setMode] = useState<'shopify' | 'manual'>('shopify')

  // Shopify orders state
  const [shopifyOrders, setShopifyOrders] = useState<any[]>([])
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)
  const [selectedOrderId, setSelectedOrderId] = useState('')
  const [selectedOrderName, setSelectedOrderName] = useState('')
  const [shopifyCustomerId, setShopifyCustomerId] = useState<string | null>(null)
  const [orderFilter, setOrderFilter] = useState('')
  const [showOrderDropdown, setShowOrderDropdown] = useState(false)

  // Autocomplete products suggestions state (for manual mode)
  const [activeSuggestionIdx, setActiveSuggestionIdx] = useState<number | null>(null)
  const [suggestions, setSuggestions] = useState<any[]>([])
  const searchTimeoutRef = useRef<number | null>(null)

  // Client Details form state
  const [clientNom, setClientNom] = useState('')
  const [clientPrenom, setClientPrenom] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientTelephone, setClientTelephone] = useState('')
  const [clientAdresse, setClientAdresse] = useState('')
  const [modeLivraison, setModeLivraison] = useState<'domicile' | 'retrait_magasin'>('domicile')
  const [livreurId, setLivreurId] = useState('')
  const [datePrevue, setDatePrevue] = useState('')
  const [creneau, setCreneau] = useState('')
  const [items, setItems] = useState([{ designation: '', quantite: 1, prix_unitaire: 0 }])

  // Load Shopify orders on mount
  useEffect(() => {
    setLoadingOrders(true)
    getUnfulfilledShopifyOrdersAction()
      .then((res) => {
        if (res.success && res.orders) {
          setShopifyOrders(res.orders)
        } else {
          console.error('Failed to load Shopify orders:', res.error)
        }
      })
      .catch((err) => console.error('Error loading Shopify orders:', err))
      .finally(() => setLoadingOrders(false))
  }, [])

  // Filter shopify orders in client view
  const filteredOrders = useMemo(() => {
    const q = orderFilter.toLowerCase().trim()
    if (!q) return shopifyOrders
    return shopifyOrders.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q)
    )
  }, [shopifyOrders, orderFilter])

  // Item list utilities
  const addItem = () => setItems([...items, { designation: '', quantite: 1, prix_unitaire: 0 }])
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx))
  const updateItem = (idx: number, field: string, value: any) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
  }

  // Handle autocomplete query for manual item name
  const handleDesignationChange = (idx: number, val: string) => {
    updateItem(idx, 'designation', val)

    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current)

    const q = val.trim()
    if (q.length < 1) {
      setSuggestions([])
      setActiveSuggestionIdx(null)
      return
    }

    searchTimeoutRef.current = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/shopify/products?q=${encodeURIComponent(q)}`)
        if (r.ok) {
          const data = await r.json()
          setSuggestions(data.products || [])
          setActiveSuggestionIdx(idx)
        }
      } catch (err) {
        console.error('Error fetching product suggestions:', err)
      }
    }, 200) as unknown as number
  }

  const total = items.reduce((s, it) => s + it.quantite * it.prix_unitaire, 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const validItems = items.filter((it) => it.designation.trim())
    if (!clientNom.trim() || !clientAdresse.trim()) {
      alert('Veuillez remplir le nom du client et l\'adresse.')
      return
    }
    if (validItems.length === 0) {
      alert('Veuillez saisir au moins un article.')
      return
    }

    if (mode === 'shopify') {
      if (!selectedOrderId) {
        alert('Veuillez sélectionner une commande Shopify.')
        return
      }
      onSave({
        is_import: true,
        shopify_order_id: selectedOrderId,
        numero_commande: selectedOrderName,
        client_nom: clientNom.trim(),
        client_prenom: clientPrenom.trim(),
        client_email: clientEmail.trim(),
        client_telephone: clientTelephone.trim(),
        client_adresse: clientAdresse.trim(),
        mode_livraison: modeLivraison,
        livreur_id: livreurId || undefined,
        date_livraison_prevue: datePrevue || undefined,
        creneau: creneau || undefined,
        items: validItems,
        shopify_customer_id: shopifyCustomerId,
      })
    } else {
      onSave({
        is_import: false,
        client_nom: clientNom.trim(),
        client_prenom: clientPrenom.trim(),
        client_email: clientEmail.trim(),
        client_telephone: clientTelephone.trim(),
        client_adresse: clientAdresse.trim(),
        mode_livraison: modeLivraison,
        livreur_id: livreurId || undefined,
        date_livraison_prevue: datePrevue || undefined,
        creneau: creneau || undefined,
        items: validItems,
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl border border-navy-100 shadow-2xl flex flex-col animate-scale-up">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-navy-100">
          <h3 className="text-lg font-bold text-navy font-display mb-0">Créer un Bon de livraison</h3>
          <button onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-navy-50 transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Source Toggle Tabs */}
        <div className="flex border-b border-navy-100 px-6 bg-navy-50/20 gap-4">
          <button
            type="button"
            onClick={() => {
              setMode('shopify')
              setClientNom('')
              setClientPrenom('')
              setClientEmail('')
              setClientTelephone('')
              setClientAdresse('')
              setItems([{ designation: '', quantite: 1, prix_unitaire: 0 }])
              setOrderFilter('')
              setSelectedOrderId('')
              setSelectedOrderName('')
              setShopifyCustomerId(null)
            }}
            className={`py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              mode === 'shopify'
                ? 'border-navy text-navy font-black'
                : 'border-transparent text-muted hover:text-navy'
            }`}
          >
            Commande Shopify
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('manual')
              setClientNom('')
              setClientPrenom('')
              setClientEmail('')
              setClientTelephone('')
              setClientAdresse('')
              setItems([{ designation: '', quantite: 1, prix_unitaire: 0 }])
              setSelectedOrderId('')
              setSelectedOrderName('')
              setShopifyCustomerId(null)
            }}
            className={`py-3 text-xs font-black uppercase tracking-wider border-b-2 transition-all ${
              mode === 'manual'
                ? 'border-navy text-navy font-black'
                : 'border-transparent text-muted hover:text-navy'
            }`}
          >
            Saisie Manuelle (Hors Shopify)
          </button>
        </div>

        {/* Form scrollable container */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {/* Shopify Order Import Selector */}
          {mode === 'shopify' && (
            <div className="bg-cream/40 p-4 rounded-xl border border-navy-100/60 space-y-3">
              <h4 className="text-xs uppercase font-bold text-navy tracking-wider mb-0">Importer depuis Shopify</h4>
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      placeholder={loadingOrders ? "Chargement des commandes..." : "Rechercher par N° commande (#1001) ou client..."}
                      value={orderFilter}
                      onChange={(e) => {
                        setOrderFilter(e.target.value)
                        setShowOrderDropdown(true)
                      }}
                      onFocus={() => setShowOrderDropdown(true)}
                      onBlur={() => setTimeout(() => setShowOrderDropdown(false), 200)}
                      className="w-full rounded-xl border border-navy-100 bg-white px-3.5 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow"
                      disabled={loadingOrders}
                    />
                    {showOrderDropdown && filteredOrders.length > 0 && (
                      <div className="absolute left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-navy-100 rounded-xl shadow-lg z-50 divide-y divide-navy-50">
                        {filteredOrders.map((o) => (
                          <div
                            key={o.id}
                            onMouseDown={async (e) => {
                              e.preventDefault()
                              setSelectedOrderId(o.id)
                              setSelectedOrderName(o.name)
                              setOrderFilter(`${o.name} - ${o.customer_name}`)
                              setShowOrderDropdown(false)

                              // Auto-fill details
                              setClientNom(o.shipping_address?.last_name || o.customer?.last_name || '')
                              setClientPrenom(o.shipping_address?.first_name || o.customer?.first_name || '')
                              setClientEmail(o.email || o.customer?.email || '')
                              setClientTelephone(o.shipping_address?.phone || o.customer?.phone || '')
                              
                              let fullAddr = o.shipping_address?.address1 || ''
                              if (o.shipping_address?.city) {
                                fullAddr += `, ${o.shipping_address.zip || ''} ${o.shipping_address.city}`
                              }
                              setClientAdresse(fullAddr)

                              setShopifyCustomerId(o.customer?.id ? String(o.customer.id) : null)
                              setModeLivraison(o.shipping_address ? 'domicile' : 'retrait_magasin')

                              // Fetch line items on-demand from Shopify
                              setLoadingItems(true)
                              setItems([{ designation: 'Chargement des articles...', quantite: 1, prix_unitaire: 0 }])
                              try {
                                const res = await getShopifyOrderLineItemsAction(o.id)
                                if (res.success && res.line_items && res.line_items.length > 0) {
                                  setItems(
                                    res.line_items.map((it: any) => ({
                                      designation: it.title,
                                      quantite: it.quantity,
                                      prix_unitaire: Number(it.price)
                                    }))
                                  )
                                } else {
                                  setItems([{ designation: '', quantite: 1, prix_unitaire: 0 }])
                                  if (res.error) {
                                    alert(res.error)
                                  }
                                }
                              } catch (err: any) {
                                console.error('Error fetching line items:', err)
                                setItems([{ designation: '', quantite: 1, prix_unitaire: 0 }])
                              } finally {
                                setLoadingItems(false)
                              }
                            }}
                            className="px-3.5 py-2 text-xs hover:bg-cream hover:text-navy cursor-pointer flex justify-between items-center"
                          >
                            <div>
                              <span className="font-black text-navy mr-2">{o.name}</span>
                              <span className="text-slate-700 font-semibold">{o.customer_name}</span>
                            </div>
                            <span className="font-bold text-muted">{Number(o.total_price).toFixed(2)} €</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {showOrderDropdown && filteredOrders.length === 0 && (
                      <div className="absolute left-0 right-0 mt-1 p-3 text-center bg-white border border-navy-100 rounded-xl shadow-lg z-50 text-xs text-muted">
                        Aucune commande correspondante en attente.
                      </div>
                    )}
                  </div>
                  {orderFilter && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrderId('')
                        setSelectedOrderName('')
                        setOrderFilter('')
                        setShopifyCustomerId(null)
                        setClientNom('')
                        setClientPrenom('')
                        setClientEmail('')
                        setClientTelephone('')
                        setClientAdresse('')
                        setItems([{ designation: '', quantite: 1, prix_unitaire: 0 }])
                      }}
                      className="rounded-xl border border-navy-100 px-3 bg-white text-muted hover:bg-navy-50 text-xs font-bold"
                    >
                      Effacer
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Client Details Section */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase font-bold text-navy-500 tracking-wider mb-2">Informations destinataire</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-muted">Nom *</label>
                <input required value={clientNom} onChange={(e) => setClientNom(e.target.value)} className="mt-1 w-full rounded-xl border border-navy-100 bg-cream-100/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted">Prénom</label>
                <input value={clientPrenom} onChange={(e) => setClientPrenom(e.target.value)} className="mt-1 w-full rounded-xl border border-navy-100 bg-cream-100/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted">Téléphone</label>
                <input value={clientTelephone} onChange={(e) => setClientTelephone(e.target.value)} className="mt-1 w-full rounded-xl border border-navy-100 bg-cream-100/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted">Email</label>
                <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} type="email" className="mt-1 w-full rounded-xl border border-navy-100 bg-cream-100/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-muted">Adresse de livraison *</label>
                <input required value={clientAdresse} onChange={(e) => setClientAdresse(e.target.value)} className="mt-1 w-full rounded-xl border border-navy-100 bg-cream-100/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow" placeholder="Ex: 12 Rue des Lois, 31000 Toulouse" />
              </div>
            </div>
          </div>

          {/* Delivery assignment settings */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase font-bold text-navy-500 tracking-wider mb-2">Options de livraison</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold text-muted">Mode</label>
                <select value={modeLivraison} onChange={(e) => setModeLivraison(e.target.value as any)} className="mt-1 w-full rounded-xl border border-navy-100 bg-cream-100/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow">
                  <option value="domicile">Domicile</option>
                  <option value="retrait_magasin">Retrait</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted">Livreur</label>
                <select value={livreurId} onChange={(e) => setLivreurId(e.target.value)} className="mt-1 w-full rounded-xl border border-navy-100 bg-cream-100/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow">
                  <option value="">Non assigné</option>
                  {drivers.map((d) => <option key={d.id} value={d.id}>{d.prenom} {d.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted">Date Prévue</label>
                <input type="date" value={datePrevue} onChange={(e) => setDatePrevue(e.target.value)} className="mt-1 w-full rounded-xl border border-navy-100 bg-cream-100/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow" />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted">Créneau</label>
                <select value={creneau} onChange={(e) => setCreneau(e.target.value)} className="mt-1 w-full rounded-xl border border-navy-100 bg-cream-100/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow">
                  <option value="">Non spécifié</option>
                  <option value="matin">Matin</option>
                  <option value="apres_midi">Après-midi</option>
                  <option value="soir">Soir</option>
                </select>
              </div>
            </div>
          </div>

          {/* Product Items Details */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs uppercase font-bold text-navy-500 tracking-wider">Articles</h4>
              <button type="button" onClick={addItem} className="text-xs font-bold text-navy hover:text-yellow transition-colors">+ Ajouter</button>
            </div>
            
            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={idx} className="flex gap-2 items-end">
                  <div className="flex-1 relative">
                    {idx === 0 && <label className="block text-xs font-bold text-muted">Désignation *</label>}
                    <input
                      required
                      value={it.designation}
                      onChange={(e) => {
                        if (mode === 'manual') {
                          handleDesignationChange(idx, e.target.value)
                        } else {
                          updateItem(idx, 'designation', e.target.value)
                        }
                      }}
                      onFocus={() => {
                        if (mode === 'manual' && it.designation.trim()) {
                          handleDesignationChange(idx, it.designation)
                        }
                      }}
                      onBlur={() => setTimeout(() => {
                        if (activeSuggestionIdx === idx) {
                          setActiveSuggestionIdx(null)
                        }
                      }, 200)}
                      placeholder="Ex: Tapis berbère"
                      className="w-full rounded-xl border border-navy-100 bg-cream-100/50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow"
                    />
                    {mode === 'manual' && activeSuggestionIdx === idx && suggestions.length > 0 && (
                      <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white border border-navy-100 rounded-xl shadow-lg z-50 divide-y divide-navy-50">
                        {suggestions.map((s, sIdx) => (
                          <div
                            key={sIdx}
                            onMouseDown={(e) => {
                              e.preventDefault()
                              updateItem(idx, 'designation', s.title)
                              updateItem(idx, 'prix_unitaire', s.price || 0)
                              setSuggestions([])
                              setActiveSuggestionIdx(null)
                            }}
                            className="px-3 py-2 text-xs hover:bg-cream hover:text-navy cursor-pointer flex justify-between items-center"
                          >
                            <span className="font-semibold truncate mr-2">{s.title}</span>
                            <span className="font-bold text-navy shrink-0">{s.price ? `${s.price.toFixed(2)} €` : '—'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="w-16">
                    {idx === 0 && <label className="block text-xs font-bold text-muted">Qté</label>}
                    <input type="number" min={1} required value={it.quantite} onChange={(e) => updateItem(idx, 'quantite', Number(e.target.value))} className="w-full rounded-xl border border-navy-100 bg-cream-100/50 px-2 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow text-center" />
                  </div>
                  <div className="w-24">
                    {idx === 0 && <label className="block text-xs font-bold text-muted">Prix Unit TTC</label>}
                    <input type="number" min={0} step={0.01} required value={it.prix_unitaire} onChange={(e) => updateItem(idx, 'prix_unitaire', Number(e.target.value))} className="w-full rounded-xl border border-navy-100 bg-cream-100/50 px-2 py-2 text-xs outline-none focus:ring-1 focus:ring-yellow text-center" />
                  </div>
                  {items.length > 1 && (
                    <button type="button" onClick={() => removeItem(idx)} className="p-2 text-danger hover:text-red-700 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            
            <div className="mt-4 text-right font-black text-navy text-sm">
              Total estimé : {total.toFixed(2)} €
            </div>
          </div>
        </form>

        {/* Sticky modal footer */}
        <div className="p-6 border-t border-navy-100 flex justify-end gap-2 bg-navy-50/20">
          <button type="button" onClick={onClose} className="rounded-xl border border-navy-200 hover:bg-navy-50 text-navy px-4 py-2.5 text-xs font-bold transition-all">
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || loadingItems || !clientNom.trim() || !clientAdresse.trim() || items.every((it) => !it.designation.trim()) || (mode === 'shopify' && !selectedOrderId)}
            className="rounded-xl bg-navy hover:bg-navy-700 text-white font-bold px-4 py-2.5 text-xs transition-all shadow-sm disabled:opacity-50"
          >
            {saving ? 'Création...' : loadingItems ? 'Chargement...' : 'Créer le BL'}
          </button>
        </div>

      </div>
    </div>
  )
}
