import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const API_VERSION = '2024-10'

const ALL_PRODUCTS_QUERY = `
  query GetAllProducts($first: Int!, $after: String) {
    products(first: $first, after: $after, query: "status:active") {
      edges {
        node {
          id
          title
          handle
          status
          featuredImage { url altText }
          variants(first: 20) {
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
        cursor
      }
      pageInfo {
        hasNextPage
      }
    }
  }
`

function normalizeShop(shop: string): string {
  return shop.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

// Global in-memory cache variables (resists between hot requests in Node)
let cachedProducts: any[] | null = null
let lastCacheFetchTime = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds
let currentFetchPromise: Promise<any[]> | null = null

async function fetchAllActiveProductsFromShopify(shop: string, token: string): Promise<any[]> {
  const url = `https://${shop}/admin/api/${API_VERSION}/graphql.json`
  let allProducts: any[] = []
  let hasNextPage = true
  let afterCursor: string | null = null
  const maxPages = 5 // Guard against infinite loop
  let pageCount = 0

  while (hasNextPage && pageCount < maxPages) {
    pageCount++
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({
        query: ALL_PRODUCTS_QUERY,
        variables: { first: 250, after: afterCursor },
      }),
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Shopify HTTP ${res.status} : ${text.slice(0, 200)}`)
    }

    const json: any = await res.json()
    if (json.errors) {
      throw new Error(`Shopify GraphQL : ${JSON.stringify(json.errors).slice(0, 300)}`)
    }

    const edges = json?.data?.products?.edges || []
    const pageInfo = json?.data?.products?.pageInfo

    for (const { node } of edges) {
      const variant = node?.variants?.edges?.[0]?.node
      const price = variant?.price ? Number(variant.price) : null
      const oldPrice = variant?.compareAtPrice ? Number(variant.compareAtPrice) : null
      const productUrl = `https://${shop}/products/${node.handle}`

      allProducts.push({
        id: node.id,
        title: node.title,
        handle: node.handle,
        sku: variant?.sku || '',
        price,
        oldPrice: oldPrice && price && oldPrice > price ? oldPrice : null,
        image: node?.featuredImage?.url || null,
        url: productUrl,
      })
    }

    hasNextPage = pageInfo?.hasNextPage || false
    if (hasNextPage && edges.length > 0) {
      afterCursor = edges[edges.length - 1].cursor
    } else {
      break
    }
  }

  return allProducts
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

    const shop = normalizeShop(shopRaw)
    const now = Date.now()
    const isCacheExpired = now - lastCacheFetchTime > CACHE_TTL

    if (!cachedProducts || isCacheExpired) {
      if (!currentFetchPromise) {
        currentFetchPromise = fetchAllActiveProductsFromShopify(shop, token)
          .then((products) => {
            cachedProducts = products
            lastCacheFetchTime = Date.now()
            currentFetchPromise = null
            console.log(`[products-cache] Successfully cached ${products.length} products.`)
            return products
          })
          .catch((err) => {
            currentFetchPromise = null
            console.error('[products-cache] Error fetching products:', err)
            if (cachedProducts) {
              console.warn('[products-cache] Serving stale cache due to fetch error.')
              return cachedProducts
            }
            throw err
          })
      }
      await currentFetchPromise
    }

    const q = (req.nextUrl.searchParams.get('q') || '').toString().toLowerCase().trim()
    let results = cachedProducts || []

    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean)
      results = results.filter((p) => {
        const titleMatch = p.title?.toLowerCase() || ''
        const skuMatch = p.sku?.toLowerCase() || ''
        return tokens.every((t) => titleMatch.includes(t) || skuMatch.includes(t))
      })
    }

    return NextResponse.json({ products: results.slice(0, 20) })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Server error', code: 'ERR' }, { status: 500 })
  }
}


