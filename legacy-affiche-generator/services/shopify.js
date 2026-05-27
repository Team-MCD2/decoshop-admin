/* ============================================================
   services/shopify.js
   ------------------------------------------------------------
   Client de l'Admin API Shopify (GraphQL). Deux modes :

   1) STANDALONE (Custom App admin token)
      - Variables : SHOPIFY_SHOP, SHOPIFY_ADMIN_TOKEN,
        SHOPIFY_PUBLIC_DOMAIN (optionnel)
      - Lance via `npm start` ou `npm run dev`
      - getConfig().configured reflete la presence des creds

   2) EMBEDDED (app Shopify, OAuth via @shopify/shopify-app-express)
      - Variables : SHOPIFY_API_KEY, SHOPIFY_API_SECRET,
        SCOPES, HOST (injectees par `shopify app dev`)
      - Le serveur instancie shopifyApp() et passe la session
        OAuth a searchProducts({ session, shopifyApi })

   Quand la session est passee, on utilise le client GraphQL
   de la lib officielle (gestion auto du token / version API).
   Sinon on retombe sur fetch + token statique.
   ============================================================ */

'use strict';

const SHOPIFY_API_VERSION = '2024-10';

// --- Config -----------------------------------------------------------------
function getConfig() {
  const shop          = (process.env.SHOPIFY_SHOP          || '').trim();
  const token         = (process.env.SHOPIFY_ADMIN_TOKEN   || '').trim();
  const publicDomain  = (process.env.SHOPIFY_PUBLIC_DOMAIN || '').trim();
  return {
    shop,
    token,
    publicDomain,
    configured: Boolean(shop && token)
  };
}

// --- HTTP GraphQL -----------------------------------------------------------
// opts:
//   - session     : Shopify Session (mode embedded)
//   - shopifyApi  : instance shopifyApp().api (mode embedded)
async function gql(query, variables = {}, opts = {}) {
  // Mode 1 : embedded -> client session-aware fourni par la lib.
  if (opts.session && opts.shopifyApi) {
    const client = new opts.shopifyApi.clients.Graphql({ session: opts.session });
    try {
      const response = await client.request(query, { variables });
      if (response.errors) {
        const err = new Error(`Shopify GraphQL : ${JSON.stringify(response.errors).slice(0, 300)}`);
        err.code = 'GRAPHQL';
        throw err;
      }
      return response.data;
    } catch (e) {
      if (e.code) throw e;
      const err = new Error(`Shopify (session) : ${e.message}`);
      err.code = 'SESSION';
      throw err;
    }
  }

  // Mode 2 : standalone -> fetch + admin token.
  const cfg = getConfig();
  if (!cfg.configured) {
    const err = new Error('Shopify n\'est pas configure (SHOPIFY_SHOP / SHOPIFY_ADMIN_TOKEN manquants)');
    err.code = 'NOT_CONFIGURED';
    throw err;
  }

  const url = `https://${cfg.shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': cfg.token
      },
      body: JSON.stringify({ query, variables })
    });
  } catch (e) {
    const err = new Error(`Reseau Shopify : ${e.message}`);
    err.code = 'NETWORK';
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Shopify HTTP ${res.status} : ${text.slice(0, 200)}`);
    err.code = 'HTTP_' + res.status;
    throw err;
  }

  const data = await res.json();
  if (data.errors) {
    const err = new Error(`Shopify GraphQL : ${JSON.stringify(data.errors).slice(0, 300)}`);
    err.code = 'GRAPHQL';
    throw err;
  }
  return data.data;
}

// --- Search products -------------------------------------------------------
const SEARCH_QUERY = `
  query SearchProducts($query: String, $first: Int!) {
    products(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
      edges {
        node {
          id
          title
          handle
          status
          onlineStoreUrl
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

/**
 * Cherche des produits par titre OU SKU.
 * @param {string} q Texte libre.
 * @param {object} [opts]
 * @param {object} [opts.session]    Shopify session (mode embedded)
 * @param {object} [opts.shopifyApi] shopifyApp().api (mode embedded)
 * @returns {Promise<Array>} Liste normalisee pour le frontend.
 */
async function searchProducts(q, opts = {}) {
  const cleaned = (q || '').toString().trim();

  // Construit la string de recherche au format Shopify Search & Filter.
  // Si vide -> tous les produits actifs (les 20 derniers maj).
  // Sinon -> match titre OU sku (wildcards).
  let query = '';
  if (cleaned) {
    const escaped = cleaned.replace(/[\\"]/g, ' ');
    query = `(title:*${escaped}* OR sku:*${escaped}*) AND status:active`;
  } else {
    query = 'status:active';
  }

  const data = await gql(SEARCH_QUERY, { query, first: 20 }, opts);

  // Resoud le "host" public pour fabriquer une URL produit lisible :
  // - mode embedded : la session contient le shop (.myshopify.com),
  //   on prefere SHOPIFY_PUBLIC_DOMAIN si fourni
  // - mode standalone : meme logique via getConfig()
  let host;
  if (opts.session) {
    host = (process.env.SHOPIFY_PUBLIC_DOMAIN || '').trim() || opts.session.shop;
  } else {
    const cfg = getConfig();
    host = cfg.publicDomain || cfg.shop;
  }

  return data.products.edges.map(({ node }) => {
    const variant  = node.variants.edges[0] && node.variants.edges[0].node;
    const price    = variant && variant.price          ? Number(variant.price)          : null;
    const oldPrice = variant && variant.compareAtPrice ? Number(variant.compareAtPrice) : null;

    // URL publique : on la construit depuis le host (publicDomain ou shop)
    // pour garantir qu'on utilise le domaine souhaite.
    let url = `https://${host}/products/${node.handle}`;

    return {
      id:       node.id,
      title:    node.title,
      handle:   node.handle,
      sku:      (variant && variant.sku) || '',
      price,
      oldPrice: (oldPrice && price && oldPrice > price) ? oldPrice : null,
      image:    (node.featuredImage && node.featuredImage.url) || null,
      url
    };
  });
}

module.exports = { getConfig, searchProducts };
