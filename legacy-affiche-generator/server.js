// ============================================================
// DecoShop — Generateur d'etiquettes de vente
// Serveur Express bi-mode :
//  - STANDALONE (par defaut)  : lance via `npm start`,
//    utilise les vars SHOPIFY_SHOP / SHOPIFY_ADMIN_TOKEN.
//  - EMBEDDED  (Shopify app) : lance via `shopify app dev`,
//    OAuth + App Bridge + iframe admin Shopify.
//
// Le basculement est automatique : si SHOPIFY_API_KEY et
// SHOPIFY_API_SECRET sont presents, on monte la stack OAuth.
// ============================================================

// Charge .env (silencieux si pas de fichier .env, par ex. en prod
// ou les vars sont injectees par la plateforme).
require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const shopifyService = require('./services/shopify');

const app = express();

const PUBLIC_DIR   = path.join(__dirname, 'public');
const VIEWS_DIR    = path.join(__dirname, 'views');
const THEME_ASSETS = path.join(__dirname, '..', 'theme', 'assets');

// View engine : EJS (partials via <%- include('partials/x') %>)
app.set('view engine', 'ejs');
app.set('views', VIEWS_DIR);

// ============================================================
// Detection mode embedded
// ============================================================
const EMBEDDED = Boolean(
  process.env.SHOPIFY_API_KEY && process.env.SHOPIFY_API_SECRET
);

let shopify = null; // instance de shopifyApp() (uniquement en mode embedded)

if (EMBEDDED) {
  // Le tunnel Cloudflare/ngrok poste des X-Forwarded-* qu'il faut respecter
  app.set('trust proxy', 1);

  const { shopifyApp } = require('@shopify/shopify-app-express');
  const { LATEST_API_VERSION } = require('@shopify/shopify-api');

  // HOST est injecte par Shopify CLI au format `https://xxxx.trycloudflare.com`.
  // L'API attend hostName SANS le scheme.
  const hostName = (process.env.HOST || 'localhost')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');

  shopify = shopifyApp({
    api: {
      apiKey:       process.env.SHOPIFY_API_KEY,
      apiSecretKey: process.env.SHOPIFY_API_SECRET,
      scopes:       (process.env.SCOPES || 'read_products')
                      .split(',').map(s => s.trim()).filter(Boolean),
      hostName,
      apiVersion:   LATEST_API_VERSION,
      isEmbeddedApp: true
    },
    auth: {
      path:         '/api/auth',
      callbackPath: '/api/auth/callback'
    },
    webhooks: {
      path: '/api/webhooks'
    }
    // sessionStorage non specifie -> memory (OK pour dev, a remplacer en prod)
  });

  // OAuth installation flow
  app.get(shopify.config.auth.path, shopify.auth.begin());
  app.get(
    shopify.config.auth.callbackPath,
    shopify.auth.callback(),
    shopify.redirectToShopifyOrAppRoot()
  );

  // Webhooks (vide pour l'instant — extensible plus tard)
  app.post(
    shopify.config.webhooks.path,
    shopify.processWebhooks({ webhookHandlers: {} })
  );

  // CSP frame-ancestors : indispensable pour s'embarquer dans l'admin Shopify
  app.use(shopify.cspHeaders());

  console.log(`[shopify] mode EMBEDDED - apiKey ${process.env.SHOPIFY_API_KEY.slice(0, 6)}... host ${hostName}`);
} else {
  console.log('[shopify] mode STANDALONE');
}

// Page principale - branchee plus bas (apres les routes API)

// 1) Favicon : sert le .ico officiel directement (les navigateurs requetent
//    /favicon.ico a la racine par convention). Fallback 204 si absent.
app.get('/favicon.ico', (req, res) => {
  const ico = path.join(PUBLIC_DIR, 'assets', 'favicon.ico');
  if (fs.existsSync(ico)) return res.sendFile(ico);
  res.status(204).end();
});

// 2) Assets : passe-plat vers le theme Shopify (source unique de verite en dev local).
//    Si le dossier theme/ n'est pas la (deploiement Vercel ou seul 'generateur/'
//    est embarque), on delegue a express.static qui servira la copie bundlee
//    dans public/assets/.
app.use('/assets', (req, res, next) => {
  const themeFile = path.join(THEME_ASSETS, req.path);
  if (fs.existsSync(themeFile) && fs.statSync(themeFile).isFile()) {
    return res.sendFile(themeFile);
  }
  next();
});

// 3) Serve static files (CSS, JS, public/assets/* en fallback)
//    'index: false' empeche express.static de servir un eventuel index.html
//    a la racine, pour que notre route GET / (EJS) gagne la priorite.
app.use(express.static(PUBLIC_DIR, { index: false }));

// 4) Healthcheck
app.get('/health', (req, res) => res.json({
  ok: true,
  version: require('./package.json').version,
  embedded: EMBEDDED
}));

// ============================================================
// 5) API Shopify (lecture seule, scope read_products)
// ============================================================

// Etat : indique au frontend quel mode utiliser.
app.get('/api/shopify/status', (req, res) => {
  if (EMBEDDED) {
    return res.json({
      configured: true,
      shop: req.query.shop || null,
      embedded: true
    });
  }
  const { configured, shop } = shopifyService.getConfig();
  res.json({
    configured,
    shop: configured ? shop : null,
    embedded: false
  });
});

// Recherche de produits.
// En mode embedded, validateAuthenticatedSession() verifie le JWT
// d'App Bridge et place la session dans res.locals.shopify.session.
async function productsHandler(req, res) {
  try {
    const q = (req.query.q || '').toString().slice(0, 100);
    const opts = {};
    if (EMBEDDED && res.locals && res.locals.shopify && res.locals.shopify.session) {
      opts.session    = res.locals.shopify.session;
      opts.shopifyApi = shopify.api;
    }
    const products = await shopifyService.searchProducts(q, opts);
    res.json({ products });
  } catch (err) {
    const status = err.code === 'NOT_CONFIGURED' ? 503 : 500;
    console.error('[shopify]', err.code || 'ERR', err.message);
    res.status(status).json({ error: err.message, code: err.code || null });
  }
}

if (EMBEDDED) {
  app.get(
    '/api/shopify/products',
    shopify.validateAuthenticatedSession(),
    productsHandler
  );
} else {
  app.get('/api/shopify/products', productsHandler);
}

// ============================================================
// 6) Page principale (apres les routes API)
// En embedded : ensureInstalledOnShop() redirige vers OAuth si pas installe.
// On passe apiKey + host au template pour qu'App Bridge s'auto-init.
// ============================================================
function renderIndex(req, res) {
  res.render('index', {
    apiKey:   EMBEDDED ? process.env.SHOPIFY_API_KEY : null,
    host:     req.query.host || null,
    embedded: EMBEDDED
  });
}

if (EMBEDDED) {
  app.get('/', shopify.ensureInstalledOnShop(), renderIndex);
} else {
  app.get('/', renderIndex);
}

// 7) 404
app.use((req, res) => {
  res.status(404).send('Not found.');
});

// ============================================================
// Listen : port impose par Shopify CLI en mode embedded,
// sinon port aleatoire (standalone dev).
// ============================================================
const PORT = parseInt(process.env.PORT || '0', 10);
const server = app.listen(PORT, () => {
  const { port } = server.address();
  console.log('');
  console.log('  DecoShop - Generateur d\'etiquettes');
  console.log('  --------------------------------------');
  console.log(`  http://localhost:${port}`);
  if (EMBEDDED) {
    console.log(`  Mode  : EMBEDDED (Shopify app)`);
    console.log(`  Host  : ${process.env.HOST || '(non defini)'}`);
  } else {
    console.log(`  Mode  : STANDALONE`);
  }
  console.log('');
  console.log('  Ctrl+C pour arreter.');
  console.log('');
});
