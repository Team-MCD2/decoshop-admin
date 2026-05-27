import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  const shop = (process.env.SHOPIFY_SHOP || '').trim()
  const token = (process.env.SHOPIFY_ADMIN_TOKEN || '').trim()

  return NextResponse.json({
    configured: Boolean(shop && token),
    shop: shop && token ? shop : null,
    embedded: false,
  })
}

