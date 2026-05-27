'use client'

import { useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  Search,
  Download,
  FileText,
  Printer,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  MoreVertical,
  Plus
} from 'lucide-react'
import OrderDetailPanel from '../../_components/OrderDetailPanel'

type StatusFilter = 'all' | 'unfulfilled' | 'in_progress' | 'fulfilled'
type SortKey = 'name' | 'date' | 'amount' | 'status'
type SortDir = 'asc' | 'desc'

export default function CommandesClient({ initialOrders }: { initialOrders: any[] }) {
  const router = useRouter()
  const supabase = createClient()
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Client side states
  const [orders, setOrders] = useState(initialOrders)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(10)

  // Selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // Detail panel state
  const [detailOrder, setDetailOrder] = useState<any | null>(null)

  // Fetch / refresh data
  const handleRefresh = async () => {
    setRefreshing(true)
    // Query latest orders with clients and BLs
    const { data: latestOrders } = await supabase
      .from('commandes')
      .select('*, clients(*), bons_livraison(*, lignes_bl(*))')
      .order('date_commande', { ascending: false })

    if (latestOrders) {
      setOrders(latestOrders)
      // If detail panel is open, update its reference
      if (detailOrder) {
        const updatedDetail = latestOrders.find(o => o.id === detailOrder.id)
        if (updatedDetail) setDetailOrder(updatedDetail)
      }
    }
    setRefreshing(false)
  }

  // --- Filtering ---
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      // Map local status to fulfillment filters
      const hasBL = order.bons_livraison && order.bons_livraison.length > 0
      const blStatut = hasBL ? order.bons_livraison[0].statut : null
      
      const isFulfilled = order.statut === 'expediee' || order.statut === 'livree'
      const isInProgress = order.statut === 'en_preparation'
      const isUnfulfilled = order.statut === 'en_attente'

      if (filter === 'fulfilled' && !isFulfilled) return false
      if (filter === 'in_progress' && !isInProgress) return false
      if (filter === 'unfulfilled' && !isUnfulfilled) return false

      if (search) {
        const q = search.toLowerCase()
        const matchName = order.numero_commande.toLowerCase().includes(q)
        const matchEmail = order.clients?.email?.toLowerCase().includes(q)
        const matchCustomer = `${order.clients?.prenom || ''} ${order.clients?.nom || ''}`.toLowerCase().includes(q)
        
        if (!matchName && !matchEmail && !matchCustomer) return false
      }

      return true
    })
  }, [orders, filter, search])

  // --- Sorting ---
  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = a.numero_commande.localeCompare(b.numero_commande, 'fr', { numeric: true })
          break;
        case 'date':
          cmp = new Date(a.date_commande).getTime() - new Date(b.date_commande).getTime()
          break;
        case 'amount':
          cmp = Number(a.montant_total_ttc) - Number(b.montant_total_ttc)
          break;
        case 'status':
          cmp = a.statut.localeCompare(b.statut)
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filteredOrders, sortKey, sortDir])

  // --- Pagination ---
  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / perPage))
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * perPage
    return sortedOrders.slice(start, start + perPage)
  }, [sortedOrders, page, perPage])

  // Reset page when filter/search/pageSize changes
  const handleFilterChange = (newFilter: StatusFilter) => {
    setFilter(newFilter)
    setPage(1)
  }

  const handleSearchChange = (val: string) => {
    setSearch(val)
    setPage(1)
  }

  const handlePerPageChange = (val: number) => {
    setPerPage(val)
    setPage(1)
  }

  // --- Sorting toggle ---
  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // --- Selection handlers ---
  const selectedOrders = useMemo(
    () => sortedOrders.filter((o) => selectedIds.has(o.id)),
    [sortedOrders, selectedIds]
  )

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllPage = () => {
    const pageIds = paginatedOrders.map((o) => o.id)
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

  const isAllPageSelected = paginatedOrders.length > 0 && paginatedOrders.every(o => selectedIds.has(o.id))
  const isSomePageSelected = paginatedOrders.some(o => selectedIds.has(o.id)) && !isAllPageSelected

  // --- Bulk generation of delivery notes ---
  const handleBulkCreateBLs = async () => {
    const missingBL = selectedOrders.filter(o => !o.bons_livraison || o.bons_livraison.length === 0)
    if (missingBL.length === 0) {
      alert("Toutes les commandes sélectionnées ont déjà un Bon de Livraison.")
      return
    }

    setBulkLoading(true)
    let success = 0
    let failed = 0

    for (const order of missingBL) {
      try {
        const { data: newBL, error: blError } = await supabase
          .from('bons_livraison')
          .insert({
            commande_id: order.id,
            client_id: order.client_id,
            statut: 'cree',
            mode_livraison: 'domicile',
            montant_total_ttc: order.montant_total_ttc,
          })
          .select()
          .single()

        if (blError) throw blError

        await supabase
          .from('lignes_bl')
          .insert({
            bl_id: newBL.id,
            designation: 'Récapitulatif Articles - Commande ' + order.numero_commande,
            quantite: 1,
            prix_unitaire_ttc: order.montant_total_ttc,
            ordre_tri: 1,
          })

        success++
      } catch (err) {
        console.error('Failed to create bulk BL:', err)
        failed++
      }
    }

    setBulkLoading(false)
    clearSelection()
    alert(`${success} bon(s) créé(s). ${failed} en échec.`)
    handleRefresh()
  }

  // --- CSV Export ---
  const handleExportCSV = () => {
    const rows = [
      ['Commande', 'Client', 'Email', 'Téléphone', 'Date', 'Montant TTC', 'Statut Commande', 'Bon de livraison'],
    ]
    
    sortedOrders.forEach((o) => {
      const blText = o.bons_livraison && o.bons_livraison.length > 0 
        ? `${o.bons_livraison[0].numero_bl} (${o.bons_livraison[0].statut})`
        : 'Aucun'

      rows.push([
        o.numero_commande,
        o.clients ? `${o.clients.prenom} ${o.clients.nom}` : '',
        o.clients?.email || '',
        o.clients?.telephone || '',
        new Date(o.date_commande).toLocaleDateString('fr-FR'),
        String(o.montant_total_ttc),
        o.statut,
        blText,
      ])
    })

    const delimiter = ';'
    const csvContent = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(delimiter))
      .join('\r\n')
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `decoshop-commandes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // --- PDF Export ---
  const handleExportPDF = () => {
    if (sortedOrders.length === 0) return

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const now = new Date()
    const titleDate = now.toLocaleDateString('fr-FR')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text(`DecoShop — Export Commandes (${titleDate})`, 14, 14)

    const head = [['Commande', 'Client', 'Email', 'Date', 'Montant TTC', 'Statut', 'Bon de livraison']]
    const body = sortedOrders.map((o) => [
      o.numero_commande,
      o.clients ? `${o.clients.prenom} ${o.clients.nom}` : '',
      o.clients?.email || '',
      new Date(o.date_commande).toLocaleDateString('fr-FR'),
      Number(o.montant_total_ttc).toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + ' €',
      o.statut,
      o.bons_livraison && o.bons_livraison.length > 0 ? o.bons_livraison[0].numero_bl : 'Aucun',
    ])

    autoTable(doc, {
      startY: 20,
      head,
      body,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 40 },
        2: { cellWidth: 60 },
        3: { cellWidth: 25 },
        4: { cellWidth: 30, halign: 'right' },
        5: { cellWidth: 30 },
        6: { cellWidth: 50 },
      },
    })

    doc.save(`decoshop-commandes-${now.toISOString().slice(0, 10)}.pdf`)
  }

  const printSingleOrder = (order: any) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(`BON RECAPITULATIF DE COMMANDE`, 14, 20)
    doc.setFontSize(12)
    doc.setFont('helvetica', 'normal')
    doc.text(`Commande: ${order.numero_commande}`, 14, 28)
    doc.text(`Date: ${new Date(order.date_commande).toLocaleDateString('fr-FR')}`, 14, 34)

    // Client box
    doc.rect(14, 42, 182, 30)
    doc.setFont('helvetica', 'bold')
    doc.text('INFORMATIONS CLIENT & LIVRAISON', 18, 48)
    doc.setFont('helvetica', 'normal')
    doc.text(`Destinataire: ${order.clients?.prenom} ${order.clients?.nom}`, 18, 55)
    doc.text(`Adresse: ${order.clients?.adresse_ligne1}, ${order.clients?.code_postal} ${order.clients?.ville}`, 18, 62)
    doc.text(`Téléphone: ${order.clients?.telephone || 'Pas de numéro'}`, 18, 69)

    // Items table
    const head = [['Référence / Article', 'Quantité', 'Prix Unitaire', 'Total']]
    const body = order.bons_livraison?.[0]?.lignes_bl?.map((li: any) => [
      li.designation,
      String(li.quantite),
      Number(li.prix_unitaire_ttc).toFixed(2) + ' €',
      Number(li.total_ligne_ttc || (li.quantite * li.prix_unitaire_ttc)).toFixed(2) + ' €',
    ]) || [[`Récapitulatif Commande ${order.numero_commande}`, '1', Number(order.montant_total_ttc).toFixed(2) + ' €', Number(order.montant_total_ttc).toFixed(2) + ' €']]

    autoTable(doc, {
      startY: 80,
      head,
      body,
      theme: 'striped',
      headStyles: { fillColor: [30, 58, 138] },
    })

    // Totals
    const finalY = (doc as any).lastAutoTable.finalY || 120
    doc.setFont('helvetica', 'bold')
    doc.text(`TOTAL TTC: ${Number(order.montant_total_ttc).toLocaleString('fr-FR')} EUR`, 140, finalY + 15)

    doc.save(`decoshop-commande-${order.numero_commande}.pdf`)
  }

  // --- Helpers ---
  const orderStatusBadge = (status: string) => {
    switch (status) {
      case 'expediee':
      case 'livree':
        return <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-bold text-green-800 uppercase tracking-wide">Expédiée</span>
      case 'en_preparation':
        return <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 uppercase tracking-wide">En préparation</span>
      case 'annulee':
        return <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-bold text-gray-800 uppercase tracking-wide">Annulée</span>
      default:
        return <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-800 uppercase tracking-wide">{status}</span>
    }
  }

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <h1 className="text-2xl font-bold font-display text-navy mb-0">Commandes Shopify</h1>
          <p className="text-xs text-muted">Historique des commandes et génération des bons de livraison.</p>
        </div>
        
        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Refresh Button */}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="rounded-xl border border-navy-200 p-2.5 bg-white text-navy hover:bg-navy-50 disabled:opacity-50 transition-colors shadow-sm"
            title="Rafraîchir"
          >
            <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Export buttons */}
          <button
            onClick={handleExportCSV}
            className="rounded-xl border border-navy-200 p-2.5 bg-white text-navy hover:bg-navy-50 transition-colors shadow-sm flex items-center gap-2 text-xs font-bold"
            title="Exporter CSV"
          >
            <Download className="w-4 h-4" /> CSV
          </button>

          <button
            onClick={handleExportPDF}
            className="rounded-xl border border-navy-200 p-2.5 bg-white text-navy hover:bg-navy-50 transition-colors shadow-sm flex items-center gap-2 text-xs font-bold"
            title="Exporter PDF"
          >
            <Printer className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-navy-100 shadow-sm flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {(['all', 'unfulfilled', 'in_progress', 'fulfilled'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => handleFilterChange(f)}
              className={`rounded-xl px-4 py-2 text-xs font-bold tracking-wide uppercase transition-all duration-200 ${
                filter === f
                  ? 'bg-navy text-white shadow-sm'
                  : 'bg-navy-50 text-navy hover:bg-navy-100'
              }`}
            >
              {f === 'all' ? 'Toutes' : f === 'unfulfilled' ? 'En attente' : f === 'in_progress' ? 'En cours' : 'Expédiées'}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted w-4 h-4" />
          <input
            ref={searchInputRef}
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Rechercher par commande, client ou email..."
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
              Commande{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkCreateBLs}
              disabled={bulkLoading}
              className="rounded-lg bg-yellow hover:bg-yellow-600 text-navy font-bold px-4 py-2 text-xs transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              Créer BLs en masse
            </button>
            <button
              onClick={clearSelection}
              className="rounded-lg bg-white/10 hover:bg-white/20 text-white px-3 py-2 text-xs transition-all"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Orders Table Card */}
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
                <th className="px-6 py-4 font-bold cursor-pointer select-none hover:text-yellow" onClick={() => handleSort('name')}>Commande</th>
                <th className="px-6 py-4 font-bold">Client</th>
                <th className="px-6 py-4 font-bold cursor-pointer select-none hover:text-yellow" onClick={() => handleSort('date')}>Date</th>
                <th className="px-6 py-4 font-bold cursor-pointer select-none hover:text-yellow" onClick={() => handleSort('amount')}>Montant</th>
                <th className="px-6 py-4 font-bold">Statut Commande</th>
                <th className="px-6 py-4 font-bold">Bon de livraison</th>
                <th className="px-6 py-4 font-bold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-50">
              {paginatedOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-sm text-muted">
                    Aucune commande ne correspond aux filtres actuels.
                  </td>
                </tr>
              ) : (
                paginatedOrders.map((order) => {
                  const hasBL = order.bons_livraison && order.bons_livraison.length > 0
                  const bl = hasBL ? order.bons_livraison[0] : null
                  const isSelected = selectedIds.has(order.id)

                  return (
                    <tr
                      key={order.id}
                      className={`hover:bg-cream-100/40 transition-colors ${
                        isSelected ? 'bg-yellow/5' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(order.id)}
                          className="h-4 w-4 rounded border-navy-200 text-navy focus:ring-yellow cursor-pointer"
                        />
                      </td>

                      {/* Commande Number */}
                      <td className="px-6 py-4 font-bold text-navy">
                        {order.numero_commande}
                      </td>

                      {/* Client info */}
                      <td className="px-6 py-4">
                        {order.clients ? (
                          <div className="flex flex-col">
                            <span className="font-semibold text-ink">
                              {order.clients.prenom} {order.clients.nom}
                            </span>
                            <span className="text-[10px] text-muted">{order.clients.email}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted">Pas d&apos;informations</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-6 py-4 text-xs text-ink font-medium">
                        {new Date(order.date_commande).toLocaleDateString('fr-FR')}
                      </td>

                      {/* Montant */}
                      <td className="px-6 py-4 font-bold text-navy">
                        {Number(order.montant_total_ttc).toLocaleString('fr-FR', {
                          style: 'currency',
                          currency: 'EUR',
                        })}
                      </td>

                      {/* Statut Commande */}
                      <td className="px-6 py-4">
                        {orderStatusBadge(order.statut)}
                      </td>

                      {/* Bon de livraison status */}
                      <td className="px-6 py-4">
                        {bl ? (
                          <div className="flex flex-col items-start gap-1">
                            <Link
                              href={`/admin/bons-livraison/${bl.id}`}
                              className="text-xs font-bold text-navy hover:underline"
                            >
                              {bl.numero_bl}
                            </Link>
                            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-navy-50 font-black text-navy-500">
                              {bl.statut}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted italic">Non généré</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => setDetailOrder(order)}
                          className="rounded-lg border border-navy-100 hover:bg-navy-50 px-3 py-1.5 text-xs font-bold text-navy transition-all"
                        >
                          Détails
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {sortedOrders.length > 0 && (
          <div className="bg-navy-50/20 border-t border-navy-100 px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between text-xs text-muted">
            <div className="flex items-center gap-4">
              <span>
                Affichage de <strong>{Math.min(sortedOrders.length, (page - 1) * perPage + 1)}</strong> à{' '}
                <strong>{Math.min(sortedOrders.length, page * perPage)}</strong> sur{' '}
                <strong>{sortedOrders.length}</strong> commandes
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

      {/* Slide-over Order details panel */}
      {detailOrder && (
        <OrderDetailPanel
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onRefresh={handleRefresh}
          onPrint={printSingleOrder}
        />
      )}
    </div>
  )
}
