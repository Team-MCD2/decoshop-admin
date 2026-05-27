import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const API_VERSION = '2024-10'

const SEARCH_QUERY = `
  query SearchProducts($query: String, $first: Int!) {
    products(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          handle
          status
          featuredImage { url altText }
          variants(first: 1) {
            edges {
              node {
                id
                sku
                price
                compareAtPrice
              }
            }
          }
        }
      }
    }
  }
`

function normalizeShop(shop: string): string {
  return shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

export async function GET(req: NextRequest) {
  try {
    const shopRaw = (process.env.SHOPIFY_SHOP || '').trim()
    const token = (process.env.SHOPIFY_ADMIN_TOKEN || '').trim()
    if (!shopRaw || !token) {
      return NextResponse.json(
        { error: "Shopify n'est pas configure (SHOPIFY_SHOP / SHOPIFY_ADMIN_TOKEN manquants)", code: 'NOT_CONFIGURED' },
        { status: 503 },
      )
    }

    const q = (req.nextUrl.searchParams.get('q') || '').toString().slice(0, 100).trim()
    const escaped = q.replace(/[\\"]/g, ' ')
    const query = q ? `(title:*${escaped}* OR sku:*${escaped}*) AND status:active` : 'status:active'

    const shop = normalizeShop(shopRaw)
    const url = `https://${shop}/admin/api/${API_VERSION}/graphql.json`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { query, first: 20 },
      }),
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return NextResponse.json(
        { error: `Shopify HTTP ${res.status} : ${text.slice(0, 200)}`, code: `HTTP_${res.status}` },
        { status: 500 },
      )
    }

    const json: any = await res.json()
    if (json.errors) {
      return NextResponse.json(
        { error: `Shopify GraphQL : ${JSON.stringify(json.errors).slice(0, 300)}`, code: 'GRAPHQL' },
        { status: 500 },
      )
    }

    const edges = json?.data?.products?.edges || []
    const products = edges.map(({ node }: any) => {
      const variant = node?.variants?.edges?.[0]?.node
      const price = variant?.price ? Number(variant.price) : null
      const oldPrice = variant?.compareAtPrice ? Number(variant.compareAtPrice) : null
      const productUrl = `https://${shop}/products/${node.handle}`

      return {
        id: node.id,
        title: node.title,
        handle: node.handle,
        sku: variant?.sku || '',
        price,
        oldPrice: oldPrice && price && oldPrice > price ? oldPrice : null,
        image: node?.featuredImage?.url || null,
        url: productUrl,
      }
    })

    return NextResponse.json({ products })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error', code: 'ERR' }, { status: 500 })
  }
}

