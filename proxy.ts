import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return response
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const url = new URL(request.url)
  const livreurUrl = process.env.NEXT_PUBLIC_LIVREUR_URL || 'http://localhost:5173'

  // Target paths for role-based isolation
  const isAdminPath = url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin')
  const isLivreurPath = url.pathname.startsWith('/livreur') || url.pathname.startsWith('/api/livreur')
  const isLoginPath = url.pathname === '/login'

  // If trying to access /livreur inside decoshop-admin, redirect to external Vite PWA URL
  if (isLivreurPath) {
    return NextResponse.redirect(new URL(livreurUrl))
  }

  // Redirect authenticated user away from login page
  if (isLoginPath && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'livreur') {
      return NextResponse.redirect(new URL(livreurUrl))
    } else if (profile) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
  }

  // Guard protected admin and livreur routes
  if (isAdminPath) {
    if (!user) {
      // Redirect unauthenticated user to login with a next query param
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', url.pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Fetch user profile to verify role and status
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single()

    if (error || !profile || !profile.is_active) {
      // Force logout and redirect if profile is missing, inactive, or errored
      await supabase.auth.signOut()
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'access_denied')
      return NextResponse.redirect(loginUrl)
    }

    // Ensure role matches folder path bounds (livreurs cannot access admin dashboard)
    if (profile.role === 'livreur') {
      return NextResponse.redirect(new URL(livreurUrl))
    }
  }

  // Handle root route redirection
  if (url.pathname === '/') {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'livreur') {
      return NextResponse.redirect(new URL(livreurUrl))
    } else if (profile) {
      return NextResponse.redirect(new URL('/admin', request.url))
    } else {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - api/webhooks/shopify (Shopify webhooks must bypass authentication check)
     * - _next/static (static assets)
     * - _next/image (image files)
     * - favicon.ico (favicon file)
     * - static files inside public (svg, png, etc.)
     */
    '/((?!api/webhooks/shopify|_next/static|_next/image|favicon.ico|icons|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
