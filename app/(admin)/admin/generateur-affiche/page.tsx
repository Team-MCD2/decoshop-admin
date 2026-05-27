'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import QRCode from 'qrcode'

// Legacy constants (must match the standalone generator)
const STORAGE_KEY = 'decoshop_affiche_v1'
const POSTER_PX_WIDTH = (297 * 96) / 25.4 // A4 landscape width at 96dpi

type PickerState = 'loading' | 'idle' | 'selected' | 'manual'

type ShopifyProduct = {
  id: string
  title: string
  handle: string
  sku: string
  price: number | null
  oldPrice: number | null
  image: string | null
  url: string
}

const TRANSLATIONS = {
  fr: {
    title: "Generateur d'affiches — DecoShop Toulouse",
    hint: "Remplis le formulaire puis ajoute l'etiquette a la planche A4",
    section1: '1. Donnees produit',
    section2: '2. Apercu A4 paysage',
    name: 'Nom du produit',
    ref: 'Reference / SKU',
    shopify: 'Produit Shopify',
    price: 'Prix actuel (€)',
    oldPrice: 'Prix avant promo (€)',
    eyebrow: 'Chapeau editorial',
    pitch: 'Accroche',
    mode: 'Mode tarifaire',
    modeNormal: 'Plein tarif',
    modePromo: 'Promotion',
    modeExpo: "Modele d'exposition",
    btnQr: 'Generer un QR code',
    btnPrint: "Imprimer l'affiche",
    btnReset: 'Reinitialiser',
    pickerPlaceholder: 'Rechercher un produit (titre ou SKU)...',
    pickerConnected: (shop: string) => `Connecte a ${shop}. Choisis un produit ou saisis une URL.`,
    pickerDisconnected: "Shopify non connecte — saisis l'URL produit manuellement.",
    pickerToggleToManual: 'Saisir une URL manuellement',
    pickerToggleToSearch: 'Rechercher dans Shopify',
    pickerNone: 'Aucun produit trouve.',
    qrTitle: 'Scanner pour la fiche produit',
    qrSub: 'DecoShop Toulouse · Disponible en ligne',
    errName: 'Le nom du produit est obligatoire.',
    errPrice: 'Le prix actuel est obligatoire.',
    errPricePositive: 'Le prix doit etre positif.',
    errOldPositive: 'Le prix avant promo doit etre un nombre positif.',
    errPromoOldGreater: 'En mode Promotion, le prix avant promo doit etre superieur au prix actuel.',
    tip: "Choisis Marges : Aucunes et Echelle : 100 % dans le dialogue d'impression pour un rendu A4 paysage 1:1.",
    alertNeedUrl: "Veuillez entrer une URL produit d'abord.",
    footerShop: 'En magasin',
    footerExpo: "Modele d'exposition",
  },
  ar: {
    title: 'مولد ملصقات DecoShop',
    hint: 'املأ النموذج ثم اطبع ملصق A4 أفقي',
    section1: '١. بيانات المنتج',
    section2: '٢. معاينة A4 أفقي',
    name: 'اسم المنتج',
    ref: 'المرجع / SKU',
    shopify: 'منتج Shopify',
    price: 'السعر الحالي (€)',
    oldPrice: 'السعر قبل العرض (€)',
    eyebrow: 'العنوان التحريري',
    pitch: 'وصف موجز',
    mode: 'طريقة التسعير',
    modeNormal: 'السعر الكامل',
    modePromo: 'تخفيض',
    modeExpo: 'نموذج المعرض',
    btnQr: 'إنشاء QR',
    btnPrint: 'طباعة',
    btnReset: 'إعادة تعيين',
    pickerPlaceholder: 'ابحث عن منتج (عنوان أو SKU)...',
    pickerConnected: (shop: string) => `متصل بـ ${shop}. اختر منتجاً أو أدخل رابطاً.`,
    pickerDisconnected: 'Shopify غير متصل — أدخل رابط المنتج يدوياً.',
    pickerToggleToManual: 'إدخال رابط يدوياً',
    pickerToggleToSearch: 'البحث في Shopify',
    pickerNone: 'لا توجد نتائج.',
    qrTitle: 'امسح لرؤية تفاصيل المنتج',
    qrSub: 'DecoShop تولوز · متوفر عبر الإنترنت',
    errName: 'اسم المنتج مطلوب.',
    errPrice: 'السعر الحالي مطلوب.',
    errPricePositive: 'يجب أن يكون السعر موجباً.',
    errOldPositive: 'السعر قبل العرض يجب أن يكون موجباً.',
    errPromoOldGreater: 'يجب أن يكون السعر قبل العرض أكبر من السعر الحالي.',
    tip: 'اختر الهوامش: بدون و المقياس: 100% للحصول على طباعة 1:1.',
    alertNeedUrl: 'أدخل رابط المنتج أولاً.',
    footerShop: 'في المعرض',
    footerExpo: 'نموذج العرض',
  },
} as const

function fmtPrice(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',')
}

function discountPct(oldP: number | null, currP: number | null) {
  if (!oldP || !currP || oldP <= currP) return 0
  return Math.round(((oldP - currP) / oldP) * 100)
}

function isValidHttpUrl(url: string) {
  return /^https?:\/\//i.test(url)
}

export default function GenerateurAffichePage() {
  const { locale } = useI18n()
  const t = (TRANSLATIONS as any)[locale] || TRANSLATIONS.fr
  const isRTL = locale === 'ar'

  // Form state
  const [name, setName] = useState('')
  const [ref, setRef] = useState('')
  const [productUrl, setProductUrl] = useState('')
  const [price, setPrice] = useState('')
  const [oldPrice, setOldPrice] = useState('')
  const [eyebrow, setEyebrow] = useState('')
  const [pitch, setPitch] = useState('')
  const [promo, setPromo] = useState(false)
  const [expo, setExpo] = useState(false)

  // Legacy QR gating: only generate when user requests (button) or before print
  const [currentQrUrl, setCurrentQrUrl] = useState<string | null>(null)
  const [qrImageData, setQrImageData] = useState<string | null>(null)

  // Validation (legacy rules)
  const errorMsg = useMemo(() => {
    const dName = name.trim()
    if (!dName) return t.errName
    const p = price.replace(',', '.')
    const priceNum = p === '' ? null : Number(p)
    if (priceNum == null || Number.isNaN(priceNum)) return t.errPrice
    if (priceNum < 0) return t.errPricePositive

    const o = oldPrice.replace(',', '.')
    const oldNum = o === '' ? null : Number(o)
    if (oldNum != null && (Number.isNaN(oldNum) || oldNum < 0)) return t.errOldPositive
    if (promo && oldNum != null && oldNum <= priceNum) return t.errPromoOldGreater
    return null
  }, [name, price, oldPrice, promo, t])

  // Preview scaling
  const previewWrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const wrap = previewWrapRef.current
    if (!wrap) return

    const update = () => {
      const wrapW = wrap.clientWidth
      if (!wrapW) return
      setScale(wrapW / POSTER_PX_WIDTH)
    }

    update()

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => update())
      ro.observe(wrap)
      return () => ro.disconnect()
    }

    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Persistence (legacy storage contract)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const data = JSON.parse(raw)
      if (!data || typeof data !== 'object') return
      setName(data.name || '')
      setRef(data.ref || '')
      setProductUrl(data.productUrl || '')
      setPrice(data.price == null ? '' : String(data.price))
      setOldPrice(data.oldPrice == null ? '' : String(data.oldPrice))
      setEyebrow(data.eyebrow || '')
      setPitch(data.pitch || '')
      setPromo(Boolean(data.promo))
      setExpo(Boolean(data.expo))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    try {
      const payload = {
        name: name.trim(),
        ref: ref.trim(),
        productUrl: productUrl.trim(),
        price: price.trim(),
        oldPrice: oldPrice.trim(),
        eyebrow: eyebrow.trim(),
        pitch: pitch.trim(),
        promo,
        expo,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // ignore
    }
  }, [name, ref, productUrl, price, oldPrice, eyebrow, pitch, promo, expo])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return
        const data = JSON.parse(raw)
        setName(data.name || '')
        setRef(data.ref || '')
        setProductUrl(data.productUrl || '')
        setPrice(data.price == null ? '' : String(data.price))
        setOldPrice(data.oldPrice == null ? '' : String(data.oldPrice))
        setEyebrow(data.eyebrow || '')
        setPitch(data.pitch || '')
        setPromo(Boolean(data.promo))
        setExpo(Boolean(data.expo))
      } catch {
        // ignore
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // QR generation only when currentQrUrl matches productUrl (legacy behavior)
  useEffect(() => {
    const url = productUrl.trim()
    if (!url || url !== currentQrUrl || !isValidHttpUrl(url)) {
      setQrImageData(null)
      return
    }

    QRCode.toDataURL(url, {
      width: 600,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#1E3A8A', light: '#ffffff' },
    })
      .then((dataUrl) => setQrImageData(dataUrl))
      .catch(() => setQrImageData(null))
  }, [productUrl, currentQrUrl])

  // Shopify picker (legacy module behavior)
  const [pickerState, setPickerState] = useState<PickerState>('loading')
  const [shopifyConfigured, setShopifyConfigured] = useState(false)
  const [shopifyShop, setShopifyShop] = useState<string | null>(null)
  const [pickerStatus, setPickerStatus] = useState<string>('')
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<ShopifyProduct[]>([])
  const [selectedProduct, setSelectedProduct] = useState<ShopifyProduct | null>(null)
  const [manualUrl, setManualUrl] = useState('')
  const searchTimerRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await fetch('/api/shopify/status', { cache: 'no-store' })
        const status = await r.json()
        const configured = Boolean(status?.configured)
        if (cancelled) return
        setShopifyConfigured(configured)
        setShopifyShop(status?.shop || null)

        const savedUrl = productUrl.trim()
        if (savedUrl) {
          setPickerState('manual')
          setManualUrl(savedUrl)
        } else {
          setPickerState(configured ? 'idle' : 'manual')
        }

        if (configured) setPickerStatus(t.pickerConnected(status?.shop || status?.shopName || 'Shopify'))
        else setPickerStatus(t.pickerDisconnected)
      } catch {
        if (cancelled) return
        setShopifyConfigured(false)
        setPickerState(productUrl.trim() ? 'manual' : 'manual')
        setPickerStatus(t.pickerDisconnected)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // state sync after storage restores productUrl
    const url = productUrl.trim()
    if (url) {
      setPickerState('manual')
      setManualUrl(url)
    } else {
      setSelectedProduct(null)
      setPickerState(shopifyConfigured ? 'idle' : 'manual')
      setManualUrl('')
    }
  }, [productUrl, shopifyConfigured])

  const doSearch = async (q: string) => {
    try {
      const r = await fetch('/api/shopify/products?q=' + encodeURIComponent(q), { cache: 'no-store' })
      if (!r.ok) {
        setSearchResults([])
        return
      }
      const data = await r.json()
      setSearchResults(data?.products || [])
    } catch {
      setSearchResults([])
    }
  }

  const onSearchInput = (val: string) => {
    setSearchQ(val)
    if (searchTimerRef.current) window.clearTimeout(searchTimerRef.current)
    const q = val.trim()
    if (q.length < 1) {
      setSearchResults([])
      return
    }
    searchTimerRef.current = window.setTimeout(() => doSearch(q), 250)
  }

  const onSelectProduct = (p: ShopifyProduct) => {
    setPickerState('selected')
    setSelectedProduct(p)
    setSearchResults([])
    setSearchQ('')
    // Autofill (legacy behavior)
    setName(p.title || '')
    setRef(p.sku || '')
    setPrice(p.price != null ? String(p.price) : '')
    setOldPrice(p.oldPrice != null ? String(p.oldPrice) : '')
    setProductUrl(p.url || '')
  }

  const onClearProduct = () => {
    setSelectedProduct(null)
    setSearchResults([])
    setSearchQ('')
    setManualUrl('')
    setProductUrl('')
    setPickerState(shopifyConfigured ? 'idle' : 'manual')
  }

  const onTogglePicker = () => {
    if (pickerState === 'manual') {
      setPickerState('idle')
      setSearchResults([])
      setSearchQ('')
      return
    }
    setPickerState('manual')
    setManualUrl(productUrl)
  }

  const onManualUrlInput = (val: string) => {
    setManualUrl(val)
    setProductUrl(val.trim())
  }

  // Computed numbers for preview
  const priceNum = Number((price || '0').toString().replace(',', '.')) || 0
  const oldPriceNum = oldPrice ? Number(oldPrice.toString().replace(',', '.')) || 0 : 0
  const pct = promo ? discountPct(oldPriceNum || null, priceNum || null) : 0

  // Price shrink rule (legacy)
  const formatted = priceNum.toFixed(2).replace(/\.?0+$/, '')
  const [intPart, decPart] = formatted.split('.')

  const totalChars = (intPart?.length || 0) + (decPart?.length || 0)
  const priceFontSize =
    totalChars >= 7 ? '0.45em' :
    totalChars >= 6 ? '0.52em' :
    totalChars >= 5 ? '0.65em' :
    totalChars >= 4 ? '0.8em'  :
    '1em'
  const handleGenerateQr = () => {
    const url = productUrl.trim()
    if (!url) {
      alert(t.alertNeedUrl)
      return
    }
    setCurrentQrUrl(url)
  }

  const handlePrint = (e: React.FormEvent) => {
    e.preventDefault()
    if (errorMsg) return
    const url = productUrl.trim()
    if (url) setCurrentQrUrl(url)
    setTimeout(() => window.print(), 300)
  }

  const handleReset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
    setCurrentQrUrl(null)
    setQrImageData(null)
    setSelectedProduct(null)
    setSearchResults([])
    setSearchQ('')
    setManualUrl('')
    setName('')
    setRef('')
    setProductUrl('')
    setPrice('')
    setOldPrice('')
    setEyebrow('')
    setPitch('')
    setPromo(false)
    setExpo(false)
    setPickerState(shopifyConfigured ? 'idle' : 'manual')
  }

  return (
    <div className="min-h-screen bg-cream" dir={isRTL ? 'rtl' : 'ltr'}>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&family=Poppins:ital,wght@0,300;0,400;0,500;1,400&family=Bebas+Neue&display=swap');
        @page { size: A4 landscape; margin: 0; }
        @media print {
          html, body { width: 297mm; height: 210mm; margin: 0; padding: 0; background: white; overflow: hidden; }
          .no-print { display: none !important; }
          .preview-wrap { position: absolute; inset: 0; width: 297mm; height: 210mm; border: 0; border-radius: 0; padding: 0; margin: 0; box-shadow: none; overflow: visible; background: white; }
          .preview-wrap .poster { position: absolute; top: 0; left: 0; transform: none !important; margin: 0; box-shadow: none; }
          .poster, .poster * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }

        /* Legacy visual system (subset required for 1:1 poster + picker) */
        .ga-app-header { background: #0C54AF; color: #fff; padding: 1rem 1.5rem; display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; box-shadow: 0 1px 2px rgba(15,23,42,.06); }
        .ga-hint { display:inline-flex; align-items:center; gap:.5rem; background: rgba(255,255,255,.1); padding:.5rem .9rem; border-radius: 999px; border: 1px solid rgba(255,255,255,.2); font-size:.78rem; font-weight:600; }
        .ga-grid { max-width: 1500px; margin: 0 auto; padding: 1.5rem; display:grid; grid-template-columns: minmax(360px,.9fr) minmax(420px,1.3fr); gap: 1.5rem; align-items:start; }
        @media (max-width: 1100px) { .ga-grid { grid-template-columns: 1fr; } }
        .ga-panel { background:#fff; border: 1px solid #e4e9f2; border-radius: 14px; padding: 1.4rem 1.4rem 1.6rem; box-shadow: 0 1px 2px rgba(15,23,42,.06); min-width:0; }
        .ga-title { font-family: 'Montserrat', system-ui, sans-serif; font-size: 1.15rem; margin: 0 0 1.1rem; color:#0C54AF; font-weight: 800; }
        .ga-form { display:flex; flex-direction:column; gap: 1rem; font-family: 'Poppins','Montserrat',system-ui,sans-serif; }
        .ga-field { display:flex; flex-direction:column; gap: .35rem; }
        .ga-field label { font-size:.85rem; font-weight:600; color:#0F172A; }
        .ga-field small { font-size:.75rem; color:#64748b; }
        .ga-input { width:100%; border:1.5px solid #e4e9f2; border-radius: 8px; padding:.6rem .75rem; font-size:.95rem; font-family: inherit; background:#fff; }
        .ga-input:focus { outline:0; border-color:#0C54AF; box-shadow: 0 0 0 3px #e7effa; }
        .ga-row { display:grid; grid-template-columns: 1fr 1fr; gap: .75rem; }

        .ga-actions { display:flex; gap:.6rem; flex-wrap:wrap; }
        .ga-btn { display:inline-flex; align-items:center; justify-content:center; gap:.5rem; border-radius: 10px; padding: .75rem 1rem; font-weight:800; border: 1px solid transparent; cursor:pointer; }
        .ga-btn-primary { background:#0C54AF; color:#fff; }
        .ga-btn-secondary { background:#eef2fb; color:#0C54AF; border-color:#dde5f7; }
        .ga-btn-ghost { background:transparent; color:#0F172A; border-color:#e4e9f2; }
        .ga-error { background:#fff1f2; border:1px solid #fecdd3; color:#b91c1c; border-radius: 12px; padding:.75rem .9rem; font-weight:700; font-size:.85rem; }

        /* Picker */
        .picker { border: 1.5px solid #e4e9f2; border-radius: 12px; padding: .8rem; background: #fff; }
        .picker__input { width:100%; border: 1.5px solid #e4e9f2; border-radius: 10px; padding: .65rem .75rem; font-size:.95rem; }
        .picker__results { list-style:none; margin:.6rem 0 0; padding:0; border:1px solid #e4e9f2; border-radius: 12px; overflow:hidden; }
        .picker__result { display:flex; gap:.75rem; padding:.6rem .75rem; cursor:pointer; background:#fff; }
        .picker__result:hover { background:#e7effa; }
        .picker__result-img { width:42px; height:42px; border-radius: 10px; object-fit: cover; background:#eef2fb; flex:0 0 auto; }
        .picker__result-text { display:flex; flex-direction:column; gap:.1rem; min-width:0; }
        .picker__result-text strong { font-weight: 800; font-size:.92rem; }
        .picker__result-text span { font-size:.78rem; color:#64748b; }
        .picker__chip { display:flex; align-items:center; gap:.75rem; padding:.6rem .75rem; border:1px solid #e4e9f2; border-radius: 12px; background:#fff; }
        .picker__chip-img { width:44px; height:44px; border-radius: 10px; object-fit: cover; background:#eef2fb; }
        .picker__chip-clear { margin-left:auto; display:inline-flex; align-items:center; gap:.35rem; border:1px solid #e4e9f2; border-radius: 999px; padding:.4rem .7rem; font-weight:800; cursor:pointer; background:#fff; }

        /* Poster (match legacy CSS 1:1) */
        .preview-wrap {
          position: relative;
          width: 100%;
          aspect-ratio: 297 / 210;
          background: #f3edd9;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          overflow: hidden;
          min-width: 0;
        }
        .preview-wrap .poster {
          position: absolute;
          top: 0;
          left: 0;
          transform-origin: top left;
        }

        .poster {
          width: 297mm;
          height: 210mm;
          background: #FAF7F0;
          color: #0F172A;
          font-family: 'Poppins','Montserrat',system-ui,sans-serif;
          display: grid;
          grid-template-rows: 32mm 1fr 22mm;
          position: relative;
          overflow: hidden;
          box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08);
        }

        .poster__top {
          background: #0C54AF;
          color: #ffffff;
          padding: 0 14mm;
          display: flex;
          align-items: center;
          justify-content: flex-start;
          gap: 6mm;
          position: relative;
        }

        .poster__expo {
          display: none;
          align-items: center;
          gap: 3mm;
          background: #ffffff;
          color: #0C54AF;
          padding: 2.5mm 6mm;
          border-radius: 999px;
          font-weight: 700;
          font-size: 4mm;
          letter-spacing: 0.15em;
          text-transform: uppercase;
          box-shadow: 0 1mm 3mm rgba(0, 0, 0, 0.1);
        }
        .poster[data-expo="true"] .poster__expo { display: inline-flex; }

        .poster__main {
          display: grid;
          grid-template-columns: 60% 40%;
          position: relative;
        }
        .poster__content {
          padding: 14mm 12mm 12mm 14mm;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 6mm;
          background: #FAF7F0;
          position: relative;
          z-index: 1;
        }
        .poster__content-top {
          display: flex;
          flex-direction: column;
          gap: 5mm;
        }
        .poster__eyebrow {
          display: inline-flex;
          align-items: center;
          align-self: flex-start;
          font-family: 'Poppins','Montserrat',system-ui,sans-serif;
          font-weight: 700;
          font-size: 4mm;
          letter-spacing: 0.35em;
          text-transform: uppercase;
          color: #0C54AF;
          padding: 1.6mm 4mm;
          border-left: 1.5mm solid #FACC15;
          background: #ffffff;
        }
        .poster__name {
          font-family: 'Montserrat', system-ui, sans-serif;
          font-weight: 800;
          font-size: 21mm;
          line-height: 0.95;
          margin: 0;
          color: #0F172A;
          word-break: break-word;
          hyphens: auto;
        }
        .poster__ref {
          font-size: 4mm;
          letter-spacing: 0.3em;
          text-transform: uppercase;
          color: #64748b;
          font-weight: 600;
        }
        .poster__pitch {
          font-family: 'Poppins','Montserrat',system-ui,sans-serif;
          font-size: 4.5mm;
          line-height: 1.4;
          color: #0F172A;
          max-width: 95%;
          font-style: italic;
          font-weight: 400;
        }

        .poster__qr {
          display: flex;
          align-items: center;
          gap: 5mm;
          padding-top: 4mm;
          border-top: 0.4mm solid rgba(30, 58, 138, 0.18);
        }
        .poster__qr-code {
          flex: 0 0 auto;
          width: 32mm;
          height: 32mm;
          background: #ffffff;
          padding: 1.5mm;
          border-radius: 2mm;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1mm 3mm rgba(15, 23, 42, 0.08);
        }
        .poster__qr-code img {
          display: block;
          width: 100%;
          height: 100%;
        }
        .poster__qr-code:empty::before {
          content: 'QR';
          font-family: 'Bebas Neue', 'Impact', 'Arial Narrow', sans-serif;
          font-size: 12mm;
          letter-spacing: 0.1em;
          color: #64748b;
          opacity: 0.6;
        }
        .poster__qr-label {
          display: flex;
          flex-direction: column;
          gap: 1mm;
          max-width: 80mm;
        }
        .poster__qr-label strong {
          font-family: 'Montserrat', system-ui, sans-serif;
          font-weight: 800;
          font-size: 4.4mm;
          line-height: 1.15;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #0C54AF;
        }
        .poster__qr-label span {
          font-family: 'Poppins','Montserrat',system-ui,sans-serif;
          font-size: 3.1mm;
          font-weight: 400;
          letter-spacing: 0.06em;
          color: #64748b;
          line-height: 1.3;
        }

        /* Skewed yellow separator (critical missing piece in current output) */
        .poster__corner {
          position: absolute;
          top: 0;
          left: 60%;
          width: 28mm;
          height: 100%;
          background: #FACC15;
          transform: translateX(-50%) skewX(-12deg);
          z-index: 0;
        }

        .poster__price-block {
          background: #FACC15;
          color: #0C54AF;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          padding: 10mm 4mm;
          position: relative;
          text-align: center;
          z-index: 1;
        }
        .poster__old {
          font-family: 'Bebas Neue', 'Impact', 'Arial Narrow', sans-serif;
          font-weight: 400;
          font-size: 14mm;
          line-height: 1;
          letter-spacing: 0.02em;
          color: #0C54AF;
          opacity: 0.55;
          text-decoration: line-through;
          text-decoration-thickness: 1mm;
          text-decoration-color: #dc2626;
          margin-bottom: 3mm;
          display: flex;
          align-items: baseline;
          gap: 1mm;
        }
        .poster__old-currency { font-size: 9mm; }
        .poster:not([data-promo="true"]) .poster__old { display: none; }

        .poster__price {
          display: flex;
          align-items: baseline;
          gap: 2mm;
          font-family: 'Bebas Neue', 'Impact', 'Arial Narrow', sans-serif;
          font-weight: 400;
          line-height: 0.9;
          color: #0C54AF;
          letter-spacing: -0.03em;
          white-space: nowrap;
          width: 100%;
          justify-content: center;
        }
        .poster__price-integer { font-size: 52mm; }
        .poster__price-decimal {
          font-size: 22mm;
          align-self: flex-start;
          margin-top: 8mm;
          margin-left: -1mm;
        }
        .poster__price-currency { font-size: 22mm; font-weight: 400; margin-left: 1mm; }
        .poster__price-label {
          margin-top: 4mm;
          font-family: 'Poppins','Montserrat',system-ui,sans-serif;
          font-size: 3.5mm;
          font-weight: 700;
          letter-spacing: 0.4em;
          text-transform: uppercase;
          color: #0C54AF;
          opacity: 0.75;
        }

        .poster__promo-ribbon {
          display: none;
          position: absolute;
          top: -28mm;
          right: -45mm;
          background: #dc2626;
          color: #ffffff;
          padding: 4mm 50mm;
          transform: rotate(40deg);
          font-family: 'Bebas Neue', 'Impact', 'Arial Narrow', sans-serif;
          font-weight: 400;
          font-size: 10mm;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          box-shadow: 0 2mm 6mm rgba(0, 0, 0, 0.25);
          border: 0.5mm solid rgba(255, 255, 255, 0.3);
          z-index: 3;
          white-space: nowrap;
          text-shadow: 0 0.5mm 1mm rgba(0, 0, 0, 0.15);
        }
        .poster[data-promo="true"] .poster__promo-ribbon { display: inline-block; }

        .poster__discount {
          display: none;
          position: absolute;
          bottom: 6mm;
          right: 6mm;
          background: #0C54AF;
          color: #FACC15;
          border: 1mm solid #ffffff;
          width: 26mm;
          height: 26mm;
          border-radius: 50%;
          font-family: 'Bebas Neue', 'Impact', 'Arial Narrow', sans-serif;
          font-weight: 400;
          font-size: 13mm;
          letter-spacing: 0.02em;
          align-items: center;
          justify-content: center;
          transform: rotate(-8deg);
          box-shadow: 0 1mm 4mm rgba(0, 0, 0, 0.18);
          z-index: 2;
        }
        .poster[data-promo="true"] .poster__discount:not(:empty) { display: flex; }

        .poster__bottom {
          background: #0C54AF;
          color: #ffffff;
          padding: 0 14mm;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6mm;
          font-size: 3.6mm;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-weight: 600;
        }
        .poster__sep { margin: 0 1.5mm; color: #FACC15; opacity: 0.8; }
        .poster__bottom-mode { color: #FACC15; font-weight: 800; font-size: 4mm; }
      `}</style>

      {/* Legacy header */}
      <header className="ga-app-header no-print">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 hover:bg-white/15 transition-colors" aria-label="Retour admin">
            <ArrowLeft className="w-4 h-4 text-white" />
          </Link>
        </div>
        <span className="ga-hint">{t.hint}</span>
      </header>

      <main className="ga-grid no-print">
        {/* Form */}
        <section className="ga-panel" aria-label="Formulaire affiche produit">
          <h2 className="ga-title">{t.section1}</h2>

          <form className="ga-form" onSubmit={handlePrint} noValidate>
            <div className="ga-field">
              <label>
                {t.name} <span style={{ color: '#0C54AF', fontWeight: 800 }}>*</span>
              </label>
              <input
                className="ga-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="Ex. Lanterne marocaine en laiton"
                autoComplete="off"
                required
              />
              <small>Max 80 caracteres. Tient sur 2 lignes.</small>
            </div>

            <div className="ga-field">
              <label>{t.ref} <span style={{ color: '#64748b', fontWeight: 500, fontSize: '.78rem' }}>(optionnel)</span></label>
              <input
                className="ga-input"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                maxLength={20}
                placeholder="Ex. LM-1042"
                autoComplete="off"
              />
            </div>

            {/* Shopify picker */}
            <div className="ga-field">
              <label>{t.shopify} <span style={{ color: '#64748b', fontWeight: 500, fontSize: '.78rem' }}>(optionnel)</span></label>
              <div className="picker" data-state={pickerState}>
                {pickerState === 'loading' && (
                  <div style={{ fontSize: '.9rem', color: '#64748b', fontWeight: 600 }}>
                    Connexion a Shopify...
                  </div>
                )}

                {pickerState === 'idle' && (
                  <>
                    <input
                      className="picker__input"
                      type="search"
                      value={searchQ}
                      onChange={(e) => onSearchInput(e.target.value)}
                      placeholder={t.pickerPlaceholder}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {searchResults.length > 0 && (
                      <ul className="picker__results" role="listbox" aria-label="Produits Shopify">
                        {searchResults.map((p) => {
                          const priceTxt = p.price != null ? p.price.toString().replace('.', ',') + ' €' : '—'
                          const skuTxt = p.sku ? p.sku + ' · ' : ''
                          return (
                            <li
                              key={p.id}
                              className="picker__result"
                              role="option"
                              tabIndex={0}
                              onClick={() => onSelectProduct(p)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  onSelectProduct(p)
                                }
                              }}
                            >
                              {p.image ? (
                                <img className="picker__result-img" src={p.image} alt="" loading="lazy" />
                              ) : (
                                <span className="picker__result-img" aria-hidden="true" />
                              )}
                              <div className="picker__result-text">
                                <strong>{p.title}</strong>
                                <span>{skuTxt}{priceTxt}</span>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                    {searchQ.trim().length > 0 && searchResults.length === 0 && (
                      <div style={{ marginTop: '.6rem', fontSize: '.85rem', color: '#64748b', fontWeight: 600 }}>
                        {t.pickerNone}
                      </div>
                    )}
                  </>
                )}

                {pickerState === 'selected' && selectedProduct && (
                  <div className="picker__chip">
                    {selectedProduct.image ? (
                      <img className="picker__chip-img" src={selectedProduct.image} alt="" />
                    ) : (
                      <span className="picker__chip-img" aria-hidden="true" />
                    )}
                    <div className="min-w-0">
                      <strong style={{ display: 'block', fontWeight: 800 }}>{selectedProduct.title || 'Produit'}</strong>
                      <span style={{ fontSize: '.78rem', color: '#64748b' }}>
                        {[selectedProduct.sku, selectedProduct.price != null ? `${selectedProduct.price.toString().replace('.', ',')} €` : '']
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                    <button type="button" className="picker__chip-clear" onClick={onClearProduct} aria-label="Changer de produit">
                      <span>Changer</span>
                    </button>
                  </div>
                )}

                {pickerState === 'manual' && (
                  <input
                    className="ga-input"
                    type="url"
                    value={manualUrl}
                    onChange={(e) => onManualUrlInput(e.target.value)}
                    placeholder="https://decoshop311.myshopify.com/products/lanterne-laiton"
                    autoComplete="off"
                    inputMode="url"
                  />
                )}

                <small className="block mt-2" style={{ color: '#64748b' }}>
                  <span>{pickerStatus}</span>{' '}
                  <button
                    type="button"
                    onClick={onTogglePicker}
                    style={{ marginLeft: 8, fontWeight: 800, color: '#0C54AF', background: 'transparent', border: 0, cursor: 'pointer' }}
                  >
                    {pickerState === 'manual' && shopifyConfigured ? t.pickerToggleToSearch : t.pickerToggleToManual}
                  </button>
                </small>
              </div>
            </div>

            <div className="ga-row">
              <div className="ga-field">
                <label>
                  {t.price} <span style={{ color: '#0C54AF', fontWeight: 800 }}>*</span>
                </label>
                <input
                  className="ga-input"
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="59"
                />
              </div>
              <div className="ga-field">
                <label>{t.oldPrice} <span style={{ color: '#64748b', fontWeight: 500, fontSize: '.78rem' }}>(optionnel)</span></label>
                <input
                  className="ga-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={oldPrice}
                  onChange={(e) => setOldPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="89"
                />
              </div>
            </div>

            <div className="ga-field">
              <label>{t.eyebrow} <span style={{ color: '#64748b', fontWeight: 500, fontSize: '.78rem' }}>(optionnel)</span></label>
              <input className="ga-input" value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} maxLength={40} autoComplete="off" />
              <small>Petit titre servi en haut a gauche, juste avant le nom du produit.</small>
            </div>

            <div className="ga-field">
              <label>{t.pitch} <span style={{ color: '#64748b', fontWeight: 500, fontSize: '.78rem' }}>(optionnel)</span></label>
              <input className="ga-input" value={pitch} onChange={(e) => setPitch(e.target.value)} maxLength={120} autoComplete="off" />
              <small>Une phrase qui contextualise l'objet. Si vide, on garde la baseline DecoShop.</small>
            </div>

            <div className="ga-field">
              <label className="font-semibold">{t.mode}</label>
              <div className="ga-row">
                <label style={{ display: 'block', cursor: 'pointer' }}>
                  <input type="radio" name="promo" value="off" checked={!promo} onChange={() => setPromo(false)} style={{ display: 'none' }} />
                  <span className="ga-btn ga-btn-secondary" style={{ width: '100%', justifyContent: 'flex-start' }}>
                    {t.modeNormal}
                  </span>
                </label>
                <label style={{ display: 'block', cursor: 'pointer' }}>
                  <input type="radio" name="promo" value="on" checked={promo} onChange={() => setPromo(true)} style={{ display: 'none' }} />
                  <span className="ga-btn ga-btn-secondary" style={{ width: '100%', justifyContent: 'flex-start' }}>
                    {t.modePromo}
                  </span>
                </label>
              </div>
              <small>
                En mode Promotion, renseigne le prix avant promo ci-dessus pour activer la barre rouge et le calcul automatique de la remise.
              </small>
            </div>

            <div className="ga-field">
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '.6rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={expo} onChange={(e) => setExpo(e.target.checked)} style={{ marginTop: 3 }} />
                <span>
                  <strong>{t.modeExpo}</strong>
                  <small style={{ display: 'block' }}>
                    Coche si la piece est un modele de demonstration en magasin (badge dedie sur l'affiche).
                  </small>
                </span>
              </label>
            </div>

            {errorMsg && <p className="ga-error" role="alert">{errorMsg}</p>}

            <div className="ga-actions">
              <button type="button" className="ga-btn ga-btn-secondary" onClick={handleGenerateQr}>
                {t.btnQr}
              </button>
              <button type="submit" className="ga-btn ga-btn-primary" disabled={Boolean(errorMsg)}>
                {t.btnPrint}
              </button>
              <button type="button" className="ga-btn ga-btn-ghost" onClick={handleReset}>
                {t.btnReset}
              </button>
            </div>

            <p className="text-sm text-muted flex items-start gap-2" style={{ color: '#64748b' }}>
              <span>ℹ</span> <span>{t.tip}</span>
            </p>
          </form>
        </section>

        {/* Preview */}
        <section className="ga-panel" aria-label="Apercu de l'affiche" style={{ position: 'sticky', top: '1rem', maxHeight: 'calc(100vh - 2rem)', overflowY: 'auto' }}>
          <h2 className="ga-title">{t.section2}</h2>

          <div ref={previewWrapRef} className="preview-wrap" id="previewWrap">
            <article
              className="poster"
              data-promo={promo ? 'true' : 'false'}
              data-expo={expo ? 'true' : 'false'}
              style={{ transform: `scale(${scale})` }}
            >
              <header className="poster__top">
                {expo && (
                  <div className="poster__expo" aria-hidden="true">
                    <span>{t.footerExpo}</span>
                  </div>
                )}
              </header>

              <main className="poster__main">
                <section className="poster__content">
                  <div className="poster__content-top">
                    <span className="poster__eyebrow">{(eyebrow || 'Coup de coeur')}</span>
                    <h1 className="poster__name">{(name.trim() || 'Nom du produit')}</h1>
                    {ref.trim() ? <div className="poster__ref">{`Ref. ${ref.trim()}`}</div> : <div className="poster__ref" style={{ display: 'none' }} />}
                    <div className="poster__pitch">{(pitch || 'Decouvrez nos nouveautes en magasin a Toulouse.')}</div>
                  </div>

                  <div className="poster__qr" data-qr-module>
                    <div className="poster__qr-code" data-qr>
                      {qrImageData ? <img src={qrImageData} alt="QR code produit" /> : null}
                    </div>
                    <div className="poster__qr-label">
                      <strong>{t.qrTitle}</strong>
                      <span>{t.qrSub}</span>
                    </div>
                  </div>
                </section>

                <aside className="poster__price-block">
                  <span className="poster__promo-ribbon" aria-hidden="true">Promo</span>
                  <span className="poster__discount" aria-hidden="true">{promo && pct > 0 ? `-${pct}%` : ''}</span>
                  {promo && oldPriceNum > 0 ? (
                    <div className="poster__old">
                      <span>{fmtPrice(oldPriceNum)}</span>
                      <span className="poster__old-currency">€</span>
                    </div>
                  ) : null}

                  <div className="poster__price" style={{ fontSize: priceFontSize }}>
                    <span className="poster__price-integer">{intPart}</span>
                    <span className="poster__price-decimal">
                      {decPart ? `,${decPart}` : ''}
                    </span>
                    <span className="poster__price-currency">€</span>
                  </div>
                  <span className="poster__price-label">Prix TTC</span>
                </aside>

                <span className="poster__corner" aria-hidden="true" />
              </main>

              <footer className="poster__bottom">
                <span className="poster__bottom-left">
                  <span className="poster__bottom-mode">{expo ? t.footerExpo : t.footerShop}</span>
                </span>
                <span className="poster__bottom-right">
                  DecoShop Toulouse <span className="poster__sep">·</span> Le mobilier qui vous ressemble
                </span>
              </footer>
            </article>
          </div>

          <p className="text-sm italic text-center mt-3" style={{ color: '#64748b' }}>
            L'apercu reflete exactement ce qui sera imprime (A4 paysage, 297 × 210 mm).
          </p>
        </section>
      </main>
    </div>
  )
}
