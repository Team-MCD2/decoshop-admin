'use server'

const SHOPIFY_STORE_URL = process.env.SHOPIFY_SHOP || '';
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN || '';
const API_VERSION = '2024-10';

export interface ShopifyProduct {
  id: string
  title: string
  handle: string
  sku: string
  price: number | null
  oldPrice: number | null
  image: string | null
  url: string
}

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
`;

export async function isShopifyConfigured(): Promise<boolean> {
  return Boolean(SHOPIFY_STORE_URL && SHOPIFY_ACCESS_TOKEN);
}

export async function searchShopifyProductsAction(q: string): Promise<ShopifyProduct[]> {
  try {
    const isConfig = await isShopifyConfigured();
    if (!isConfig) {
      return [];
    }

    const cleaned = q.trim();
    let query = '';
    if (cleaned) {
      const escaped = cleaned.replace(/[\\"]/g, ' ');
      query = `(title:*${escaped}* OR sku:*${escaped}*) AND status:active`;
    } else {
      query = 'status:active';
    }

    const url = `https://${SHOPIFY_STORE_URL.replace(/\/$/, '')}/admin/api/${API_VERSION}/graphql.json`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        variables: { query, first: 20 }
      })
    });

    if (!res.ok) {
      throw new Error(`Shopify API error HTTP ${res.status}`);
    }

    const json = await res.json();
    if (json.errors) {
      throw new Error(`Shopify GraphQL error: ${JSON.stringify(json.errors)}`);
    }

    const edges = json.data?.products?.edges || [];
    return edges.map(({ node }: any) => {
      const variant = node.variants?.edges?.[0]?.node;
      const price = variant?.price ? Number(variant.price) : null;
      const oldPrice = variant?.compareAtPrice ? Number(variant.compareAtPrice) : null;

      const host = SHOPIFY_STORE_URL;
      const productUrl = `https://${host}/products/${node.handle}`;

      return {
        id: node.id,
        title: node.title,
        handle: node.handle,
        sku: variant?.sku || '',
        price,
        oldPrice: (oldPrice && price && oldPrice > price) ? oldPrice : null,
        image: node.featuredImage?.url || null,
        url: productUrl
      };
    });
  } catch (err: any) {
    console.error('[shopify-search]', err.message);
    return [];
  }
}
