'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useI18n } from '@/lib/i18n'
import {
  CheckCircle,
  AlertTriangle,
  Globe,
  Eraser,
  FileText,
  DollarSign,
  UserCheck,
  Building,
  Calendar,
  X,
  Mail
} from 'lucide-react'

export default function SignClient({
  initialDetails,
  token
}: {
  initialDetails: any
  token: string
}) {
  const router = useRouter()
  const supabase = createClient()
  const { t, locale, setLocale } = useI18n()

  const [details, setDetails] = useState(initialDetails)
  const [saving, setSaving] = useState(false)
  const [isSigned, setIsSigned] = useState(details.is_signed)

  // Direct canvas states
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  // Close relative states
  const [isParent, setIsParent] = useState(false)
  const [parentNom, setParentNom] = useState('')
  const [parentLien, setParentLien] = useState('')
  const [emailClient, setEmailClient] = useState('')

  // Layout setup
  const setupCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width
    canvas.height = 180
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0b1f52' // Deep Navy
    ctx.lineWidth = 3
    ctxRef.current = ctx
  }

  useEffect(() => {
    if (!isSigned && !details.is_expired) {
      setTimeout(setupCanvas, 150)
    }
  }, [isSigned, details.is_expired])

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    }
  }

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    const ctx = ctxRef.current
    if (!ctx) return
    const p = getCanvasPoint(e)
    isDrawingRef.current = true
    lastPointRef.current = p
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const ctx = ctxRef.current
    const last = lastPointRef.current
    if (!ctx || !last) return
    const p = getCanvasPoint(e)

    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    lastPointRef.current = p
    setHasInk(true)
  }

  const endDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = false
    lastPointRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = ctxRef.current
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas || !hasInk) return
    if (!emailClient.trim()) {
      alert(t('signature.errors.email_required', 'Veuillez saisir votre adresse email de vérification.'))
      return
    }
    if (isParent && !parentNom) {
      alert(t('signature.errors.invalid_data', 'Veuillez saisir le nom de la personne signataire.'))
      return
    }

    setSaving(true)
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const { data, error } = await supabase.rpc('submit_signature', {
        p_token: token,
        p_signature_data: dataUrl,
        p_email_client: emailClient.trim(),
        p_signe_par_parent: isParent,
        p_parent_nom: isParent ? parentNom : null,
        p_parent_lien: isParent ? parentLien : null,
        p_user_agent: navigator.userAgent
      })

      if (error) throw error

      setIsSigned(true)
      setDetails((prev: any) => ({ ...prev, status: 'signe', is_signed: true }))
      alert(t('signature.signed_ok', 'Signature enregistrée avec succès.'))
      router.refresh()
    } catch (err: any) {
      console.error(err)
      alert(t('signature.errors.generic', 'Erreur de signature : ') + err.message)
    } finally {
      setSaving(false)
    }
  }

  const toggleLanguage = () => {
    setLocale(locale === 'fr' ? 'ar' : 'fr')
  }

  return (
    <div className="min-h-screen bg-cream flex flex-col justify-between p-4 sm:p-6" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      
      {/* Top logo & language toggles */}
      <header className="flex justify-between items-center pb-4 border-b border-navy-100 max-w-md w-full mx-auto">
        <div className="flex flex-col">
          <h1 className="text-base font-black font-display text-navy mb-0 tracking-wider">
            DECOSHOP TOULOUSE
          </h1>
          <span className="text-[9px] text-muted tracking-wider uppercase font-semibold">
            {t('signature.public.powered_by', 'Signature sécurisée · DecoShop Toulouse')}
          </span>
        </div>

        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1 text-xs font-bold text-navy hover:bg-navy-50 px-2 py-1 rounded-xl border border-navy-100 transition-all select-none"
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="uppercase">{locale === 'fr' ? 'AR' : 'FR'}</span>
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto my-6 space-y-5">
        
        {/* Expired State */}
        {details.is_expired && !isSigned && (
          <div className="bg-white p-6 rounded-2xl border border-rose-100 shadow-md text-center space-y-4 animate-fade-in">
            <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
            <h2 className="text-lg font-bold font-display text-navy mb-1">
              {t('signature.public.expired_title', 'Lien expiré')}
            </h2>
            <p className="text-xs text-muted leading-relaxed">
              {t('signature.public.expired_body', 'Le lien de signature a expiré. Veuillez demander à votre livreur d\'en générer un nouveau.')}
            </p>
          </div>
        )}

        {/* Already Signed State */}
        {isSigned && (
          <div className="bg-white p-6 rounded-2xl border border-emerald-100 shadow-md text-center space-y-4 animate-fade-in">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto" />
            <h2 className="text-lg font-bold font-display text-navy mb-1">
              {t('signature.public.already_signed_title', 'Déjà signé')}
            </h2>
            <p className="text-xs text-muted leading-relaxed">
              {t('signature.public.already_signed_body', 'Cette livraison a déjà été signée — merci !')}
            </p>
          </div>
        )}

        {/* Active Signature Panel */}
        {!details.is_expired && !isSigned && (
          <div className="bg-white p-5 rounded-2xl border border-navy-100 shadow-md space-y-4 animate-fade-in">
            <div className="border-b border-navy-50 pb-3">
              <h2 className="text-base font-bold font-display text-navy mb-0">
                {t('signature.public.title', 'Signature de votre livraison')}
              </h2>
              <p className="text-[10px] text-muted">
                {t('signature.public.subtitle', 'Veuillez vérifier les informations ci-dessous et signer.')}
              </p>
            </div>

            {/* Delivery Recap Details */}
            <div className="bg-cream-100 border border-navy-50 p-4 rounded-xl space-y-2.5 text-[11px] text-muted">
              <div className="flex justify-between">
                <span className="font-bold text-navy">{t('signature.public.bl_label', 'Bon de livraison')} :</span>
                <span className="font-bold text-slate-800">{details.numero_bl}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-navy">{t('signature.public.client_label', 'Destinataire')} :</span>
                <span className="font-bold text-slate-800">{details.client_prenom} {details.client_nom}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-navy">{t('signature.public.delivery_label', 'Mode de livraison')} :</span>
                <span className="font-bold text-slate-800">
                  {details.mode_livraison === 'retrait_magasin'
                    ? t('signature.public.delivery_pickup', 'Retrait en magasin')
                    : t('signature.public.delivery_home', 'Livraison à domicile')}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold text-navy">{t('signature.public.articles_label', 'Articles')} :</span>
                <span className="font-bold text-slate-800">
                  {details.articles_count > 1
                    ? t('signature.public.articles_count_plural', '{{count}} articles').replace('{{count}}', String(details.articles_count))
                    : t('signature.public.articles_count', '{{count}} article').replace('{{count}}', String(details.articles_count))}
                </span>
              </div>
              <div className="flex justify-between border-t border-navy-100/60 pt-2.5 mt-1 text-xs">
                <span className="font-extrabold text-navy">{t('signature.public.amount_label', 'Montant TTC')} :</span>
                <span className="font-black text-navy">{Number(details.montant_total_ttc).toFixed(2)} €</span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Close relative toggle */}
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isParentToggle"
                    checked={isParent}
                    onChange={(e) => setIsParent(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-navy cursor-pointer"
                  />
                  <label htmlFor="isParentToggle" className="font-bold text-slate-700 select-none">
                    {t('signature.parent_toggle', 'Je suis un tiers / proche')}
                  </label>
                </div>

                {isParent && (
                  <div className="grid grid-cols-2 gap-2 animate-fade-in">
                    <div className="space-y-0.5">
                      <label className="font-bold text-slate-500">{t('signature.parent_name_label', 'Nom')}</label>
                      <input
                        type="text"
                        required
                        value={parentNom}
                        onChange={(e) => setParentNom(e.target.value)}
                        placeholder={t('signature.parent_name_placeholder', 'Ex. Marie Dupont')}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                      />
                    </div>
                    <div className="space-y-0.5">
                      <label className="font-bold text-slate-500">{t('signature.parent_link_label', 'Relation')}</label>
                      <input
                        type="text"
                        value={parentLien}
                        onChange={(e) => setParentLien(e.target.value)}
                        placeholder={t('signature.parent_link_placeholder', 'Voisin, Conjoint...')}
                        className="w-full rounded-xl border border-slate-200 bg-white p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Email verification input */}
              <div className="space-y-1 text-xs">
                <label className="font-bold text-navy flex items-center gap-1">
                  <Mail className="w-4 h-4 text-navy-500" />
                  <span>{t('signature.email_verification_label', 'Email de commande pour vérification')} *</span>
                </label>
                <input
                  type="email"
                  required
                  value={emailClient}
                  onChange={(e) => setEmailClient(e.target.value)}
                  placeholder={t('signature.email_verification_placeholder', 'Saisissez l\'email associé à la commande')}
                  className="w-full rounded-xl border border-slate-200 bg-white p-2.5 outline-none focus:ring-1 focus:ring-yellow"
                />
              </div>

              {/* Canvas drawing area */}
              <div className="space-y-2 text-xs">
                <label className="font-bold text-navy flex items-center gap-1">
                  <UserCheck className="w-4 h-4 text-navy-500" />
                  <span>{t('signature.modal_title', 'Zone de signature')}</span>
                </label>
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    onPointerDown={startDraw}
                    onPointerMove={draw}
                    onPointerUp={endDraw}
                    onPointerCancel={endDraw}
                    className="w-full bg-white rounded-xl border-2 border-line cursor-crosshair h-[180px] touch-none"
                    style={{ touchAction: 'none' }}
                  />
                  {!hasInk && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted select-none">
                      {t('signature.draw_here', 'Signez ici')}
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center pt-1">
                  <button
                    type="button"
                    onClick={clearCanvas}
                    disabled={!hasInk}
                    className="text-xs text-muted hover:text-rose-600 disabled:opacity-40 flex items-center gap-1 font-bold"
                  >
                    <Eraser className="w-3.5 h-3.5" /> {t('signature.clear', 'Effacer')}
                  </button>
                  <span className="text-[10px] text-muted">
                    {t('signature.public.consent', 'En signant, je confirme avoir reçu les articles en bon état.')}
                  </span>
                </div>
              </div>

              {/* Submit button */}
              <button
                type="submit"
                disabled={!hasInk || saving}
                className="w-full bg-navy hover:bg-navy-700 text-white font-extrabold p-3.5 rounded-xl text-center shadow-md text-xs transition-all disabled:opacity-45 mt-2"
              >
                {saving ? t('signature.submitting', 'Enregistrement...') : t('signature.submit', 'Valider ma signature')}
              </button>
            </form>
          </div>
        )}
      </main>

      {/* Footer copyright */}
      <footer className="text-center text-[10px] text-muted max-w-md w-full mx-auto border-t border-navy-50/50 pt-4">
        <div>{t('signature.public.powered_by', 'Signature sécurisée · DecoShop Toulouse')}</div>
        <div className="font-mono text-[8px] opacity-75 mt-0.5">TOKEN ID: {token.substring(0, 8)}...</div>
      </footer>
    </div>
  )
}
