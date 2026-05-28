'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/* ──────────────────────────────────────────────────────────────
   LoginForm — inner component using useSearchParams
   ────────────────────────────────────────────────────────────── */
function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  useEffect(() => {
    // Intercept invite/recovery tokens in URL hash and redirect drivers to the Livreur PWA
    if (typeof window !== 'undefined' && window.location.hash) {
      const hash = window.location.hash
      if (hash.includes('access_token=') && (hash.includes('type=invite') || hash.includes('type=recovery'))) {
        const isLocal = window.location.hostname === 'localhost'
        const targetOrigin = isLocal ? 'http://localhost:5173' : 'https://decoshop-livreur.vercel.app'
        window.location.href = `${targetOrigin}/reset-password${hash}`
        return
      }
    }

    const errorParam = searchParams.get('error')
    if (errorParam === 'access_denied') {
      setError("Accès refusé. Compte inactif ou rôle non autorisé.")
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.trim() || !password.trim()) {
      setError('Veuillez remplir tous les champs')
      return
    }

    setLoading(true)

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      })

      if (authError || !authData.user) {
        setError(authError?.message || 'Identifiants incorrects')
        setLoading(false)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role, is_active, pin_hash')
        .eq('id', authData.user.id)
        .single()

      if (profileError || !profile || !profile.is_active) {
        await supabase.auth.signOut()
        setError("Compte inactif ou profil manquant. Contactez l'administrateur.")
        setLoading(false)
        return
      }

      if (profile.role === 'livreur') {
        if (!profile.pin_hash) {
          router.push('/setup-pin')
        } else {
          router.push('/unlock')
        }
      } else {
        router.push('/admin')
      }

      router.refresh()

    } catch (err: any) {
      console.error('Login failure:', err)
      setError('Impossible de se connecter au serveur.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Email */}
      <div>
        <label htmlFor="login-email" className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
          Adresse email
        </label>
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <input
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="nom@decoshop-toulouse.fr"
            autoComplete="email"
            className="w-full rounded-xl border border-line bg-white py-3 pl-11 pr-4 text-sm text-ink placeholder-muted outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition-all"
          />
        </div>
      </div>

      {/* Password */}
      <div>
        <label htmlFor="login-password" className="block text-xs font-semibold uppercase tracking-wider text-navy-700 mb-1.5">
          Mot de passe
        </label>
        <div className="relative">
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-navy-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full rounded-xl border border-line bg-white py-3 pl-11 pr-11 text-sm text-ink placeholder-muted outline-none focus:border-navy focus:ring-2 focus:ring-navy/10 transition-all"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-navy transition-colors"
          >
            {showPassword ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.879L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-2.5 animate-shake">
          <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-red-700 leading-normal">{error}</span>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-navy py-3.5 text-sm font-semibold text-white shadow-md hover:bg-navy-700 hover:shadow-lg disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 group"
      >
        {loading ? (
          <>
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Connexion...
          </>
        ) : (
          <>
            Se connecter
            <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5 rtl-flip" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </>
        )}
      </button>
    </form>
  )
}

/* ──────────────────────────────────────────────────────────────
   LoginPage — main page component (white/cream DecoShop theme)
   ────────────────────────────────────────────────────────────── */
export default function LoginPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-cream relative overflow-hidden">
      {/* Subtle decorative background — light-mode compatible */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-80 h-80 sm:w-96 sm:h-96 rounded-full bg-navy/[0.04] blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 sm:w-96 sm:h-96 rounded-full bg-yellow/[0.08] blur-3xl" />
      </div>

      {/* Content wrapper — centered vertically + responsive */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-8 sm:px-6">
        <div className="w-full max-w-[420px]">

          {/* ── Brand Header ── */}
          <div className="text-center mb-8 sm:mb-10">
            {/* Logo — DecoShop circle badge, full color */}
            <div className="inline-flex items-center justify-center mb-5">
              <img
                src="/icons/logo.svg"
                alt="DecoShop Toulouse"
                className="w-20 h-20 sm:w-24 sm:h-24 drop-shadow-md"
              />
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-navy mb-1" style={{ fontFamily: 'var(--font-display)' }}>
              DECOSHOP
            </h1>
            <p className="text-sm text-muted">
              Suivi des Commandes &amp; Gestion des Livraisons
            </p>
          </div>

          {/* ── Login Card ── */}
          <div className="rounded-2xl bg-white border border-line shadow-lg p-6 sm:p-8">
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-ink mb-0.5">Connexion</h2>
              <p className="text-sm text-muted">Accédez à votre espace sécurisé</p>
            </div>

            <Suspense fallback={
              <div className="flex items-center justify-center min-h-[260px]">
                <svg className="w-8 h-8 animate-spin text-navy" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            }>
              <LoginForm />
            </Suspense>

            {/* Forgot password link */}
            <div className="flex justify-center mt-5 pt-5 border-t border-line">
              <a href="#" className="text-sm text-muted hover:text-navy transition-colors">
                Mot de passe oublié ?
              </a>
            </div>
          </div>

          {/* ── Demo credentials (dev only) ── */}
          <div className="mt-5 rounded-xl bg-white border border-line px-5 py-3.5 shadow-sm">
            <div className="flex items-start gap-2.5">
              <svg className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-xs text-muted leading-relaxed">
                <span className="text-ink font-medium">Identifiants de démonstration</span>
                <br />
                Livreur : <code className="text-navy bg-navy/5 px-1 rounded text-[11px]">karim@decoshop-toulouse.fr</code> / <code className="text-navy bg-navy/5 px-1 rounded text-[11px]">Test1234!</code>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <p className="text-center text-[10px] text-muted mt-8 uppercase tracking-wider">
            DECOSHOP &copy; {new Date().getFullYear()} — Connexion Sécurisée
          </p>
        </div>
      </div>
    </div>
  )
}
