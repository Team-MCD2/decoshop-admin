'use client'

import Link from 'next/link'
import {
  X,
  User,
  MapPin,
  CreditCard,
  Package,
  FileText,
  Printer,
  ChevronRight,
  Plus
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface OrderDetailPanelProps {
  order: any
  onClose: () => void
  onRefresh: () => void
  onPrint: (order: any) => void
}

export default function OrderDetailPanel({
  order,
  onClose,
  onRefresh,
  onPrint,
}: OrderDetailPanelProps) {
  const supabase = createClient()
  const client = order.clients
  const bls = order.bons_livraison || []

  const orderStatusStyles = (status: string) => {
    switch (status) {
      case 'expediee':
      case 'livree':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'en_preparation':
        return 'bg-amber-100 text-amber-800 border-amber-200'
      case 'annulee':
        return 'bg-gray-100 text-gray-800 border-gray-200'
      default:
        return 'bg-red-100 text-red-800 border-red-200'
    }
  }

  const blStatusStyles = (status: string) => {
    switch (status) {
      case 'signe':
      case 'livre':
        return 'bg-green-100 text-green-800'
      case 'en_route':
      case 'en_livraison':
        return 'bg-blue-100 text-blue-800 font-bold'
      case 'cree':
        return 'bg-gray-100 text-gray-800'
      case 'echec_T1':
      case 'echec_T2':
      case 'bloque':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-navy-50 text-navy-600'
    }
  }

  const handleCreateBL = async () => {
    try {
      // 1. Insert blank/summary BL
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

      // 2. Insert default line items
      const { error: lineError } = await supabase
        .from('lignes_bl')
        .insert({
          bl_id: newBL.id,
          designation: 'Récapitulatif Articles - Commande ' + order.numero_commande,
          quantite: 1,
          prix_unitaire_ttc: order.montant_total_ttc,
          ordre_tri: 1,
        })

      if (lineError) throw lineError

      onRefresh()
    } catch (err) {
      console.error('Failed to create BL manually:', err)
      alert('Impossible de générer le bon de livraison.')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop overlay */}
      <div className="absolute inset-0 bg-navy-900/40 backdrop-blur-sm transition-opacity" onClick={onClose} />

      {/* Slide-over panel container */}
      <div className="relative w-full max-w-lg bg-white shadow-2xl overflow-y-auto flex flex-col h-full animate-slide-in-right border-l border-navy-100 z-10">
        
        {/* Sticky Header */}
        <div className="sticky top-0 bg-white border-b border-navy-100 px-6 py-5 flex items-center justify-between z-10 shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-navy font-display mb-0.5">Commande {order.numero_commande}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${orderStatusStyles(order.statut)}`}>
                {order.statut}
              </span>
              <span className="text-xs text-muted">
                {new Date(order.date_commande).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 text-muted hover:bg-navy-50 hover:text-navy transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 p-6 space-y-6">
          {/* Client summary */}
          {client && (
            <section className="bg-cream-100/50 p-4 rounded-xl border border-navy-50">
              <h3 className="text-xs uppercase font-bold text-navy-500 tracking-wider flex items-center gap-2 mb-3">
                <User className="w-4 h-4" /> Client
              </h3>
              <p className="font-bold text-navy text-base mb-0.5">
                {client.prenom} {client.nom}
              </p>
              <p className="text-sm text-ink mb-1">{client.email || 'Pas d\'email'}</p>
              <p className="text-sm text-muted">{client.telephone || 'Pas de téléphone'}</p>
            </section>
          )}

          {/* Shipping Address */}
          {client && (
            <section className="bg-white p-4 rounded-xl border border-navy-100 shadow-sm">
              <h3 className="text-xs uppercase font-bold text-navy-500 tracking-wider flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4" /> Adresse de livraison
              </h3>
              <div className="text-sm text-ink space-y-1">
                <p className="font-semibold">{client.prenom} {client.nom}</p>
                <p>{client.adresse_ligne1}</p>
                {client.adresse_ligne2 && <p>{client.adresse_ligne2}</p>}
                <p>{client.code_postal} {client.ville}</p>
                <p className="text-muted text-xs capitalize">{client.pays}</p>
              </div>
            </section>
          )}

          {/* Financial summary */}
          <section className="bg-white p-4 rounded-xl border border-navy-100 shadow-sm">
            <h3 className="text-xs uppercase font-bold text-navy-500 tracking-wider flex items-center gap-2 mb-3">
              <CreditCard className="w-4 h-4" /> Paiement
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-black text-navy">
                  {Number(order.montant_total_ttc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                </p>
                <p className="text-xs text-muted mt-1">Taxes (TVA 20%): {Number(order.montant_tva || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</p>
              </div>
            </div>
          </section>

          {/* Delivery notes (Fulfillments) list */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs uppercase font-bold text-navy-500 tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4" /> Bon de livraison
              </h3>
              {bls.length === 0 && (
                <button
                  onClick={handleCreateBL}
                  className="text-xs font-bold text-navy hover:text-yellow transition-colors flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Créer BL
                </button>
              )}
            </div>

            {bls.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-navy-100 p-6 text-center bg-cream/30">
                <p className="text-sm text-muted">Aucun bon de livraison associé.</p>
                <button
                  onClick={handleCreateBL}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-navy hover:bg-navy-700 text-white font-semibold px-4 py-2 text-xs transition-all shadow-sm"
                >
                  Générer le Bon
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {bls.map((bl: any) => (
                  <div key={bl.id} className="rounded-xl border border-navy-100 p-4 bg-white shadow-sm space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-bold text-navy">{bl.numero_bl}</p>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${blStatusStyles(bl.statut)}`}>
                          {bl.statut}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={`/admin/bons-livraison/${bl.id}`}
                          className="rounded-lg bg-navy-50 text-navy hover:bg-navy-100 px-3 py-1.5 text-xs font-semibold transition-colors flex items-center gap-1"
                        >
                          Gérer <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>

                    {/* BL detailed items list if loaded */}
                    {bl.lignes_bl && bl.lignes_bl.length > 0 && (
                      <div className="border-t border-navy-50 pt-2 space-y-1">
                        <p className="text-[10px] uppercase font-bold text-muted tracking-wider">Articles à livrer:</p>
                        {bl.lignes_bl.map((li: any) => (
                          <div key={li.id} className="flex justify-between text-xs text-ink">
                            <span className="truncate max-w-[200px]">{li.designation}</span>
                            <span className="font-semibold shrink-0">×{li.quantite}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Action footer */}
        <div className="sticky bottom-0 bg-white border-t border-navy-100 p-6">
          <button
            onClick={() => onPrint(order)}
            className="w-full rounded-xl border border-navy-200 hover:bg-navy-50 px-4 py-3 text-sm font-bold text-navy transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <Printer className="w-4 h-4 text-navy" />
            Exporter PDF Récapitulatif
          </button>
        </div>

      </div>
    </div>
  )
}
