'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import BLMap from '@/app/(admin)/_components/BLMap'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  ArrowLeft,
  Calendar,
  Truck,
  FileText,
  CheckCircle,
  AlertCircle,
  MapPin,
  User,
  Phone,
  Mail,
  Copy,
  Check,
  ExternalLink,
  Printer,
  Download,
  Clock,
  Lock,
  Unlock,
  Settings,
  DollarSign,
  Activity,
  Maximize2
} from 'lucide-react'

// Map statuses to labels
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

const FAILURE_MOTIFS: Record<string, string> = {
  client_absent: 'Client absent',
  client_refuse: 'Client refuse la livraison',
  adresse_introuvable: 'Adresse introuvable',
  articles_endommages: 'Articles endommagés',
  colis_perdu: 'Colis perdu',
  meteo: 'Conditions météo',
  panne_vehicule: 'Panne véhicule',
  autre: 'Autre motif'
}

const BL_STATUSES = Object.keys(STATUS_LABELS)

export default function BLDetailClient({
  initialBL,
  drivers,
  history: initialHistory,
  attempts: initialAttempts
}: {
  initialBL: any
  drivers: any[]
  history: any[]
  attempts: any[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const { locale, t } = useI18n()

  const [bl, setBL] = useState(initialBL)
  const [history, setHistory] = useState(initialHistory)
  const [attempts, setAttempts] = useState(initialAttempts)

  const [saving, setSaving] = useState(false)
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number; accuracy_m?: number } | null>(null)
  const [copied, setCopied] = useState(false)
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null)

  // Sync with initialBL from server-side refresh
  useEffect(() => {
    setBL(initialBL)
  }, [initialBL])

  // Sync history and attempts
  useEffect(() => {
    setHistory(initialHistory)
  }, [initialHistory])

  useEffect(() => {
    setAttempts(initialAttempts)
  }, [initialAttempts])

  // Get active signature if any
  const signature = useMemo(() => {
    if (!bl.signatures_electroniques || bl.signatures_electroniques.length === 0) return null
    return bl.signatures_electroniques[0]
  }, [bl.signatures_electroniques])

  // 1. GPS live tracking subscription when status is 'en_route'
  useEffect(() => {
    if (bl.statut !== 'en_route' || !bl.livreur_id) {
      setDriverLocation(null)
      return
    }

    // Fetch last position immediately
    const fetchLastLocation = async () => {
      const { data } = await supabase
        .from('driver_locations')
        .select('lat, lng, accuracy_m')
        .eq('driver_id', bl.livreur_id)
        .order('recorded_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (data) {
        setDriverLocation({
          lat: Number(data.lat),
          lng: Number(data.lng),
          accuracy_m: data.accuracy_m
        })
      }
    }
    fetchLastLocation()

    // Realtime channel
    const channel = supabase
      .channel(`driver-live-${bl.livreur_id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'driver_locations',
          filter: `driver_id=eq.${bl.livreur_id}`
        },
        (payload) => {
          const loc = payload.new as any
          setDriverLocation({
            lat: Number(loc.lat),
            lng: Number(loc.lng),
            accuracy_m: loc.accuracy_m
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [bl.statut, bl.livreur_id])

  // 2. Direct updates handler
  const handleUpdateBL = async (patch: Record<string, any>) => {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('bons_livraison')
        .update(patch)
        .eq('id', bl.id)

      if (error) throw error

      // Update local state directly for instant feedback
      setBL((prev: any) => {
        const next = { ...prev, ...patch }
        if (patch.livreur_id !== undefined) {
          const driverInfo = drivers.find(d => d.id === patch.livreur_id)
          next.livreur = driverInfo ? { id: driverInfo.id, nom: driverInfo.nom, prenom: driverInfo.prenom } : null
        }
        return next
      })

      // Fetch fresh audit trail and states
      router.refresh()
    } catch (err: any) {
      console.error(err)
      alert('Erreur lors de la mise à jour : ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // 3. Driver assignment update
  const handleDriverChange = async (drvId: string) => {
    const patch: Record<string, any> = { livreur_id: drvId || null }
    // Auto-transition to 'assigne' if currently 'cree'
    if (drvId && bl.statut === 'cree') {
      patch.statut = 'assigne'
    } else if (!drvId && bl.statut === 'assigne') {
      patch.statut = 'cree'
    }
    await handleUpdateBL(patch)
  }

  // 4. Request Public Customer Signature Token
  const handleGenerateSignatureToken = async () => {
    setSaving(true)
    try {
      if (!bl.clients?.email) {
        alert("Impossible de générer le token de signature car le client n'a pas d'adresse email.")
        return
      }

      const { data, error } = await supabase.rpc('request_signature', {
        p_bl_id: bl.id,
        p_ttl_minutes: 10
      })

      if (error) throw error

      alert("Lien de signature généré ! Le client recevra un mail. Vous pouvez copier le lien ci-dessous.")
      router.refresh()
    } catch (err: any) {
      console.error(err)
      alert("Erreur lors de la génération de la signature : " + err.message)
    } finally {
      setSaving(false)
    }
  }

  // 5. Invalidate signature
  const handleInvalidateSignature = async () => {
    if (!confirm("Voulez-vous vraiment invalider la demande de signature en cours ?")) return
    setSaving(true)
    try {
      const { error } = await supabase.rpc('invalidate_signature', {
        p_bl_id: bl.id,
        p_motif: 'Annulation administrative vendeur/admin'
      })

      if (error) throw error

      alert("Signature invalidée.")
      router.refresh()
    } catch (err: any) {
      console.error(err)
      alert("Erreur lors de l'invalidation : " + err.message)
    } finally {
      setSaving(false)
    }
  }

  // 6. Copy customer portal signature link
  const copySignatureLink = () => {
    if (!signature) return
    const host = window.location.origin
    const url = `${host}/sign/${signature.token}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // 7. Print Receipt PDF
  const handlePrintReceipt = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const now = new Date()

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(30, 58, 138) // Navy
    doc.text('BON DE LIVRAISON', 14, 20)

    doc.setFontSize(9)
    doc.setTextColor(120, 120, 120)
    doc.text(`Imprimé par l'Admin le: ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR')}`, 14, 26)

    // Summary details Table
    const detailsHead = [['Référence BL', 'Commande Shopify', 'Date de création', 'Créneau Planifié', 'Statut']]
    const detailsBody = [[
      bl.numero_bl,
      bl.commandes?.numero_commande || 'MANUELLE',
      new Date(bl.date_creation).toLocaleDateString('fr-FR'),
      bl.creneau ? `${STATUS_LABELS[bl.creneau] || bl.creneau} (${bl.date_livraison_prevue ? new Date(bl.date_livraison_prevue).toLocaleDateString('fr-FR') : 'non spécifiée'})` : 'Non planifié',
      STATUS_LABELS[bl.statut] || bl.statut
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
    doc.rect(14, clientY, 182, 34)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(30, 58, 138)
    doc.text('INFORMATIONS CLIENT & LIVRAISON', 18, clientY + 7)

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(15, 23, 42)
    doc.text(`Destinataire : ${bl.clients?.prenom || ''} ${bl.clients?.nom || ''}`, 18, clientY + 14)
    doc.text(`Adresse : ${bl.clients?.adresse_ligne1 || ''} ${bl.clients?.adresse_ligne2 || ''} (${bl.clients?.code_postal || ''} ${bl.clients?.ville || ''})`, 18, clientY + 20)
    doc.text(`Contact : ${bl.clients?.telephone || 'Pas de tél'} / ${bl.clients?.email || 'Pas d\'email'}`, 18, clientY + 26)

    // Assigned driver box if any
    if (bl.livreur) {
      doc.setFont('helvetica', 'bold')
      doc.text(`Livreur : ${bl.livreur.prenom} ${bl.livreur.nom}`, 18, clientY + 31)
    }

    // Line items Table
    const itemsHead = [['Article', 'Quantité', 'Prix Unitaire TTC', 'Montant Ligne TTC']]
    const itemsBody = bl.lignes_bl?.map((item: any) => [
      item.designation,
      String(item.quantite),
      Number(item.prix_unitaire_ttc).toFixed(2) + ' €',
      Number(item.quantite * item.prix_unitaire_ttc).toFixed(2) + ' €',
    ]) || []

    autoTable(doc, {
      startY: clientY + 42,
      head: itemsHead,
      body: itemsBody,
      theme: 'striped',
      headStyles: { fillColor: [30, 58, 138] },
    })

    // Subtotal and final total
    const totalY = (doc as any).lastAutoTable.finalY + 10
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(30, 58, 138)

    const baseAmount = Number(bl.montant_total_ttc || 0)
    const fees = Number(bl.montant_frais_relivraison || 0)
    const finalAmount = baseAmount + fees

    doc.text(`Sous-total Articles : ${baseAmount.toFixed(2)} €`, 130, totalY)
    if (fees > 0) {
      doc.text(`Frais de re-livraison : ${fees.toFixed(2)} €`, 130, totalY + 6)
    }
    doc.setFontSize(13)
    doc.text(`TOTAL NET À PAYER : ${finalAmount.toFixed(2)} €`, 130, totalY + 14)

    // Signatures
    const sigY = totalY + 32
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(100, 100, 100)

    doc.line(14, sigY, 80, sigY)
    doc.text('Signature Expéditeur', 30, sigY + 5)

    doc.line(120, sigY, 196, sigY)
    doc.text('Signature Client', 145, sigY + 5)

    // Append signature image if signed
    if (bl.statut === 'signe' && signature?.signature_data) {
      try {
        doc.addImage(signature.signature_data, 'PNG', 125, sigY - 20, 60, 18)
      } catch (e) {
        console.error('Could not embed signature in PDF:', e)
      }
    }

    doc.save(`decoshop-bl-detail-${bl.numero_bl}.pdf`)
  }

  // Badge dynamic style mapping
  const badgeStyles = (status: string) => {
    switch (status) {
      case 'signe':
      case 'livre':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200'
      case 'en_route':
      case 'en_livraison':
        return 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse font-bold'
      case 'cree':
        return 'bg-slate-50 text-slate-600 border-slate-200'
      case 'echec_T1':
      case 'echec_T2':
      case 'bloque':
        return 'bg-rose-50 text-rose-700 border-rose-200'
      case 'confirme':
        return 'bg-amber-50 text-amber-800 border-amber-200'
      default:
        return 'bg-indigo-50 text-indigo-700 border-indigo-200'
    }
  }

  return (
    <div className="space-y-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/bons-livraison"
            className="rounded-xl border border-navy-200 p-2.5 bg-white text-navy hover:bg-navy-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-5 h-5 rtl-flip" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold font-display text-navy mb-0">
                BL {bl.numero_bl}
              </h1>
              <span className={`rounded-xl border px-3 py-1 text-xs font-bold uppercase ${badgeStyles(bl.statut)}`}>
                {STATUS_LABELS[bl.statut] || bl.statut}
              </span>
              {bl.mode_livraison === 'retrait_magasin' && (
                <span className="rounded-xl bg-purple-50 text-purple-700 border border-purple-200 px-3 py-1 text-xs font-bold uppercase">
                  Retrait Magasin
                </span>
              )}
            </div>
            <p className="text-xs text-muted">Créé le {new Date(bl.date_creation).toLocaleString('fr-FR')}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          <button
            onClick={handlePrintReceipt}
            className="rounded-xl border border-navy-200 p-2.5 bg-white text-navy hover:bg-navy-50 transition-colors shadow-sm flex items-center gap-2 text-xs font-bold"
          >
            <Printer className="w-4 h-4" /> Imprimer
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (Main details & scheduling) - 7/12 */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 1: Client & Shopify order details */}
          <div className="bg-white p-6 rounded-2xl border border-navy-100 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-navy-50 pb-3">
              <User className="w-5 h-5 text-navy-500" />
              <h3 className="text-sm font-bold text-navy uppercase tracking-wider mb-0">Destinataire & Commande</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="space-y-2">
                <span className="text-[10px] text-muted uppercase font-bold tracking-wider">Fiche Destinataire</span>
                <div className="text-sm font-bold text-ink mb-1">
                  {bl.clients?.prenom} {bl.clients?.nom}
                </div>
                <div className="flex items-center gap-2 text-muted">
                  <Phone className="w-3.5 h-3.5" />
                  {bl.clients?.telephone ? (
                    <a href={`tel:${bl.clients.telephone}`} className="hover:underline font-medium text-navy">
                      {bl.clients.telephone}
                    </a>
                  ) : (
                    <span>Non renseigné</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted">
                  <Mail className="w-3.5 h-3.5" />
                  {bl.clients?.email ? (
                    <a href={`mailto:${bl.clients.email}`} className="hover:underline font-medium text-navy">
                      {bl.clients.email}
                    </a>
                  ) : (
                    <span>Non renseigné</span>
                  )}
                </div>
              </div>

              <div className="space-y-2 border-t md:border-t-0 md:border-l border-navy-50 md:pl-4 pt-2 md:pt-0">
                <span className="text-[10px] text-muted uppercase font-bold tracking-wider">Adresse de livraison</span>
                <div className="font-semibold text-ink flex items-start gap-1.5 mt-1">
                  <MapPin className="w-4 h-4 text-navy-500 shrink-0 mt-0.5" />
                  <div>
                    <div>{bl.clients?.adresse_ligne1}</div>
                    {bl.clients?.adresse_ligne2 && <div className="text-muted font-normal">{bl.clients.adresse_ligne2}</div>}
                    <div>{bl.clients?.code_postal} {bl.clients?.ville}</div>
                  </div>
                </div>
                {(bl.clients?.etage != null || bl.clients?.code_porte || bl.clients?.commentaire_acces) && (
                  <div className="bg-cream-100 p-2.5 rounded-xl border border-navy-50/50 mt-2 text-[11px] text-muted space-y-1">
                    {bl.clients.etage != null && (
                      <div>Étage: <strong>{bl.clients.etage}</strong> {bl.clients.ascenseur ? '(Avec Ascenseur)' : '(Sans Ascenseur)'}</div>
                    )}
                    {bl.clients.code_porte && (
                      <div>Code Porte: <strong>{bl.clients.code_porte}</strong></div>
                    )}
                    {bl.clients.commentaire_acces && (
                      <div>Note d'accès: <em>{bl.clients.commentaire_acces}</em></div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-navy-50 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center text-xs">
              <div>
                <span className="text-[10px] text-muted uppercase font-bold tracking-wider">Commande Originelle</span>
                <div className="font-bold text-ink mt-0.5">
                  N° {bl.commandes?.numero_commande || 'MANUELLE'}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-muted uppercase font-bold tracking-wider">Shopify Order ID</span>
                <div className="font-mono text-muted mt-0.5">
                  {bl.commandes?.shopify_order_id || 'Création manuelle'}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-muted uppercase font-bold tracking-wider">Montant total</span>
                <div className="font-black text-navy text-sm mt-0.5">
                  {Number(bl.montant_total_ttc).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Scheduling & Driver assignment controls */}
          <div className="bg-white p-6 rounded-2xl border border-navy-100 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-navy-50 pb-3">
              <Settings className="w-5 h-5 text-navy-500" />
              <h3 className="text-sm font-bold text-navy uppercase tracking-wider mb-0">Planification & Paramètres</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              {/* Driver selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted uppercase font-bold tracking-wider flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5" /> Chauffeur Livreur
                </label>
                <select
                  value={bl.livreur_id || ''}
                  onChange={(e) => handleDriverChange(e.target.value)}
                  disabled={saving}
                  className="w-full rounded-xl border border-navy-100 bg-navy-50/50 p-2.5 font-bold outline-none text-navy focus:border-yellow transition-all"
                >
                  <option value="">Non assigné</option>
                  {drivers.map((drv) => (
                    <option key={drv.id} value={drv.id}>{drv.prenom} {drv.nom}</option>
                  ))}
                </select>
                {bl.livreur && (
                  <div className="text-[10px] text-muted mt-1 px-1">
                    Véhicule: {bl.livreur.vehicle_type || 'Non spécifié'} {bl.livreur.vehicle_immatriculation ? `(${bl.livreur.vehicle_immatriculation})` : ''}
                  </div>
                )}
              </div>

              {/* Status Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted uppercase font-bold tracking-wider flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" /> Modifier statut
                </label>
                <select
                  value={bl.statut}
                  onChange={(e) => handleUpdateBL({ statut: e.target.value })}
                  disabled={saving}
                  className="w-full rounded-xl border border-navy-100 bg-navy-50/50 p-2.5 font-bold outline-none text-navy focus:border-yellow transition-all"
                >
                  {BL_STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s] || s}</option>
                  ))}
                </select>
              </div>

              {/* Date Prevue */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted uppercase font-bold tracking-wider flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" /> Date prévue de livraison
                </label>
                <input
                  type="date"
                  value={bl.date_livraison_prevue || ''}
                  onChange={(e) => handleUpdateBL({ date_livraison_prevue: e.target.value || null })}
                  disabled={saving}
                  className="w-full rounded-xl border border-navy-100 bg-navy-50/50 p-2.5 font-bold outline-none text-navy focus:border-yellow transition-all"
                />
              </div>

              {/* Creneau select */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted uppercase font-bold tracking-wider flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Créneau Horaire
                </label>
                <select
                  value={bl.creneau || ''}
                  onChange={(e) => handleUpdateBL({ creneau: e.target.value || null })}
                  disabled={saving}
                  className="w-full rounded-xl border border-navy-100 bg-navy-50/50 p-2.5 font-bold outline-none text-navy focus:border-yellow transition-all"
                >
                  <option value="">Non planifié</option>
                  <option value="matin">Matin (9h - 12h)</option>
                  <option value="apres_midi">Après-midi (14h - 18h)</option>
                  <option value="soir">Soir (18h - 20h)</option>
                </select>
              </div>

              {/* Frais re-livraison */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-muted uppercase font-bold tracking-wider flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5" /> Frais de re-livraison
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={bl.montant_frais_relivraison || 0}
                  onChange={(e) => handleUpdateBL({ montant_frais_relivraison: parseFloat(e.target.value) || 0 })}
                  disabled={saving}
                  className="w-full rounded-xl border border-navy-100 bg-navy-50/50 p-2.5 font-bold outline-none text-navy focus:border-yellow transition-all"
                  placeholder="0.00 €"
                />
              </div>

              {/* Waiver check */}
              <div className="space-y-1.5 flex flex-col justify-end">
                <div className="flex items-center gap-2 bg-navy-50/50 p-2 rounded-xl border border-navy-100/50">
                  <button
                    type="button"
                    onClick={() => handleUpdateBL({ admin_waiver: !bl.admin_waiver })}
                    disabled={saving}
                    className="text-navy shrink-0"
                  >
                    {bl.admin_waiver ? (
                      <Unlock className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <Lock className="w-5 h-5 text-muted" />
                    )}
                  </button>
                  <div className="text-[10px]">
                    <div className="font-bold text-navy">Dérogation Admin (Waiver)</div>
                    <div className="text-muted leading-tight">Autorise la livraison malgré litiges.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 3: Detailed items list */}
          <div className="bg-white rounded-2xl border border-navy-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-navy-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-navy-500" />
                <h3 className="text-sm font-bold text-navy uppercase tracking-wider mb-0">Articles du Bon</h3>
              </div>
              <span className="text-xs text-muted font-bold">
                {bl.lignes_bl?.length || 0} article{bl.lignes_bl?.length > 1 ? 's' : ''}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-navy-50/50 text-navy font-bold uppercase tracking-wider">
                    <th className="px-6 py-3">Désignation</th>
                    <th className="px-6 py-3 text-center">Quantité</th>
                    <th className="px-6 py-3 text-right">Prix Unitaire</th>
                    <th className="px-6 py-3 text-right">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {bl.lignes_bl?.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-6 text-muted font-medium">
                        Aucun article associé à ce bon.
                      </td>
                    </tr>
                  ) : (
                    bl.lignes_bl?.map((item: any) => (
                      <tr key={item.id} className="hover:bg-cream-100/20 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-ink">{item.designation}</div>
                          <div className="flex gap-2 mt-0.5 text-[9px] text-muted">
                            {item.marque && <span>Marque: {item.marque}</span>}
                            {item.modele && <span>Modèle: {item.modele}</span>}
                            {item.poids_kg > 0 && <span>Poids: {item.poids_kg} kg</span>}
                            {item.volume_m3 > 0 && <span>Vol: {item.volume_m3} m³</span>}
                            {item.fragile && (
                              <span className="text-rose-600 bg-rose-50 border border-rose-100 rounded px-1 font-black">
                                FRAGILE
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-slate-700">
                          {item.quantite}
                        </td>
                        <td className="px-6 py-4 text-right text-muted font-medium">
                          {Number(item.prix_unitaire_ttc).toFixed(2)} €
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-navy">
                          {Number(item.total_ligne_ttc).toFixed(2)} €
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Calculations recap */}
            <div className="bg-navy-50/20 p-6 border-t border-navy-50 flex justify-end">
              <div className="w-72 space-y-1.5 text-xs">
                <div className="flex justify-between text-muted">
                  <span>Sous-total articles:</span>
                  <span className="font-bold">{Number(bl.montant_total_ttc).toFixed(2)} €</span>
                </div>
                {bl.montant_frais_relivraison > 0 && (
                  <div className="flex justify-between text-red-600 font-medium">
                    <span>Frais de re-livraison:</span>
                    <span>+{Number(bl.montant_frais_relivraison).toFixed(2)} €</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-navy border-t border-navy-100 pt-2">
                  <span>TOTAL NET À PAYER:</span>
                  <span>{(Number(bl.montant_total_ttc) + Number(bl.montant_frais_relivraison)).toFixed(2)} €</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (Maps, Signature & Auditing timelines) - 5/12 */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 4: Interactive Geotracking Map */}
          <div className="bg-white p-6 rounded-2xl border border-navy-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-navy-50 pb-3">
              <MapPin className="w-5 h-5 text-navy-500" />
              <h3 className="text-sm font-bold text-navy uppercase tracking-wider mb-0">Carte & Tracking GPS</h3>
            </div>

            <BLMap
              destLat={bl.clients?.latitude ? Number(bl.clients.latitude) : null}
              destLng={bl.clients?.longitude ? Number(bl.clients.longitude) : null}
              driver={driverLocation}
              heightClass="h-72"
            />
          </div>

          {/* Card 5: Signature panel */}
          <div className="bg-white p-6 rounded-2xl border border-navy-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-navy-50 pb-3">
              <CheckCircle className="w-5 h-5 text-navy-500" />
              <h3 className="text-sm font-bold text-navy uppercase tracking-wider mb-0">Preuve de Livraison</h3>
            </div>

            {bl.statut === 'signe' && signature ? (
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                  <CheckCircle className="w-4 h-4" />
                  <span>Livraison signée le {signature.date_signature ? new Date(signature.date_signature).toLocaleString('fr-FR') : ''}</span>
                </div>

                {signature.signe_par_parent && (
                  <div className="bg-cream-100 p-3 rounded-xl border border-navy-100/50">
                    <div>Signataire Proche: <strong>{signature.parent_nom}</strong></div>
                    <div>Relation client: <strong>{signature.parent_lien}</strong></div>
                  </div>
                )}

                {signature.signature_data && (
                  <div className="border border-navy-100 bg-slate-50 p-2.5 rounded-xl flex items-center justify-center">
                    <img
                      src={signature.signature_data}
                      alt="Signature du client"
                      className="max-h-24 object-contain"
                    />
                  </div>
                )}

                <div className="text-[10px] text-muted space-y-0.5">
                  <div>Adresse IP: {signature.client_ip || 'N/A'}</div>
                  <div className="truncate">Navigateur: {signature.user_agent || 'N/A'}</div>
                </div>
              </div>
            ) : bl.statut === 'signature_attendue' && signature ? (
              <div className="space-y-4 text-xs">
                <div className="flex items-center gap-1.5 text-amber-700 font-bold">
                  <Clock className="w-4 h-4 animate-pulse" />
                  <span>Attente de signature client</span>
                </div>

                <div className="bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded-xl">
                  Le client doit signer en ligne. Le lien expire le :{' '}
                  <strong>{new Date(signature.date_expiration).toLocaleTimeString('fr-FR')}</strong>.
                </div>

                {/* QR code and Copy Link */}
                <div className="space-y-2">
                  <span className="text-[10px] text-muted uppercase font-bold tracking-wider">Lien de signature client</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/sign/${signature.token}`}
                      className="bg-navy-50/50 p-2 rounded-xl text-[10px] font-mono select-all flex-1 border border-navy-100 focus:outline-none"
                    />
                    <button
                      onClick={copySignatureLink}
                      className="p-2.5 border border-navy-200 text-navy hover:bg-navy-50 rounded-xl transition-all shadow-sm bg-white"
                      title="Copier le lien"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <a
                      href={`/sign/${signature.token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2.5 border border-navy-200 text-navy hover:bg-navy-50 rounded-xl transition-all shadow-sm bg-white"
                      title="Ouvrir le portail"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleInvalidateSignature}
                    disabled={saving}
                    className="w-full text-center font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl p-2.5 transition-all text-xs"
                  >
                    Annuler le lien actif
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-4 space-y-3">
                <AlertCircle className="w-8 h-8 text-muted mx-auto opacity-50" />
                <div className="text-xs text-muted max-w-xs mx-auto">
                  Aucune signature enregistrée. Pour initier le parcours, le bon de livraison doit d'abord être livré.
                </div>
                {['livre', 'signature_expiree'].includes(bl.statut) && (
                  <button
                    onClick={handleGenerateSignatureToken}
                    disabled={saving}
                    className="rounded-xl bg-navy hover:bg-navy-700 text-white font-bold px-4 py-2 text-xs transition-all shadow-sm inline-flex items-center gap-1.5"
                  >
                    Générer lien de signature
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Card 6: Attempt logs */}
          {attempts.length > 0 && (
            <div className="bg-white p-6 rounded-2xl border border-navy-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-navy-50 pb-3">
                <AlertCircle className="w-5 h-5 text-rose-500" />
                <h3 className="text-sm font-bold text-navy uppercase tracking-wider mb-0">Tentatives d'échecs ({attempts.length})</h3>
              </div>

              <div className="space-y-4">
                {attempts.map((attempt) => (
                  <div key={attempt.id} className="text-xs border-b border-navy-50 pb-3 last:border-b-0 last:pb-0 space-y-2">
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-rose-600 bg-rose-50 border border-rose-100 rounded px-1.5 py-0.5 text-[10px]">
                        Tentative {attempt.numero_tentative} / 3
                      </span>
                      <span className="text-muted font-normal text-[10px]">
                        {new Date(attempt.recorded_at).toLocaleString('fr-FR')}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div>
                        Motif : <strong>{FAILURE_MOTIFS[attempt.motif] || attempt.motif}</strong>
                      </div>
                      {attempt.commentaire && (
                        <div className="text-muted leading-tight">
                          Commentaire : <em>« {attempt.commentaire} »</em>
                        </div>
                      )}
                      {attempt.livreur_profile && (
                        <div className="text-[10px] text-muted">
                          Enregistré par : {attempt.livreur_profile.prenom} {attempt.livreur_profile.nom}
                        </div>
                      )}
                    </div>

                    {attempt.photo_litige_url && (
                      <div className="relative group rounded-lg overflow-hidden border border-navy-100 max-w-[150px] cursor-pointer" onClick={() => setPreviewPhoto(attempt.photo_litige_url)}>
                        <img
                          src={attempt.photo_litige_url}
                          alt="Preuve d'échec"
                          className="w-full h-20 object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-[10px]">
                          <Maximize2 className="w-4 h-4" />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Card 7: Auditing state history */}
          <div className="bg-white p-6 rounded-2xl border border-navy-100 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-navy-50 pb-3">
              <Activity className="w-5 h-5 text-navy-500" />
              <h3 className="text-sm font-bold text-navy uppercase tracking-wider mb-0">Historique des statuts</h3>
            </div>

            <div className="relative border-l-2 border-navy-100 pl-4 space-y-5 text-xs">
              {history.length === 0 ? (
                <div className="text-muted text-center py-4">Aucun historique de statut disponible.</div>
              ) : (
                history.map((h) => (
                  <div key={h.id} className="relative">
                    <div className="absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full bg-navy border-2 border-white ring-4 ring-navy-50" />
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-ink">
                          {STATUS_LABELS[h.ancien_statut] || 'Création'} &rarr;{' '}
                          <span className="text-navy">{STATUS_LABELS[h.nouveau_statut] || h.nouveau_statut}</span>
                        </div>
                        <div className="text-[10px] text-muted mt-0.5">
                          Source: {h.trigger_source || 'Système'}
                          {h.triggered_by_profile && (
                            <span> par {h.triggered_by_profile.prenom} {h.triggered_by_profile.nom}</span>
                          )}
                        </div>
                        {h.metadata?.rpc && <div className="text-[9px] font-mono text-muted">Action: {h.metadata.rpc}</div>}
                      </div>
                      <span className="text-[9px] text-muted text-right font-mono">
                        {new Date(h.changed_at).toLocaleString('fr-FR', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Lightbox / Modal for photos */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setPreviewPhoto(null)}
        >
          <img
            src={previewPhoto}
            alt="Preuve d'échec haute définition"
            className="max-w-full max-h-[90dvh] object-contain rounded-xl shadow-lg border border-white/10"
          />
        </div>
      )}
    </div>
  )
}
