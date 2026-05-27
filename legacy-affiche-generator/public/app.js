/* ============================================================
   DecoShop — Generateur d'affiche A4 paysage
   ------------------------------------------------------------
   Une affiche par produit. Pas de planche, pas de format.
   - Lecture du formulaire en live -> #livePoster (clone du
     template #posterTemplate).
   - Mise a l'echelle de l'apercu (transform: scale) selon la
     largeur disponible : la valeur est recalculee a chaque
     resize via ResizeObserver.
   - Impression directe via window.print() (le CSS @media print
     restaure la taille reelle du poster).
   - Persistance localStorage pour conserver les saisies entre
     deux ouvertures.
   ============================================================ */

(() => {
  'use strict';

  // ----- Constantes ----------------------------------------------------------
  const STORAGE_KEY = 'decoshop_affiche_v1';
  // 297mm a 96 dpi = 297 * 96 / 25.4 = 1122.52 px (largeur reelle A4 paysage)
  const POSTER_PX_WIDTH = (297 * 96) / 25.4;

  let currentQrUrl = null; // State pour retenir si on doit générer le QR code

  // ----- Refs DOM ------------------------------------------------------------
  const form        = document.getElementById('labelForm');
  const previewWrap = document.getElementById('previewWrap');
  const livePoster  = document.getElementById('livePoster');
  const tplEl       = document.getElementById('posterTemplate');
  const errEl       = document.getElementById('formError');
  const btnReset    = document.getElementById('btnReset');

  if (!form || !previewWrap || !livePoster || !tplEl) {
    console.error('[affiche] DOM incomplet — verifie les ids du HTML.');
    return;
  }

  // ---------------------------------------------------------------------------
  // Fetch authentifie : en mode embedded (App Bridge), on attache le session
  // token JWT genere par App Bridge en header Authorization. En mode standalone
  // on retombe sur fetch tel quel.
  // ---------------------------------------------------------------------------
  async function shopifyFetch(url, options = {}) {
    const cfg = window.__DECOSHOP || {};
    if (cfg.embedded && window.shopify && typeof window.shopify.idToken === 'function') {
      try {
        const token = await window.shopify.idToken();
        const headers = new Headers(options.headers || {});
        headers.set('Authorization', `Bearer ${token}`);
        return fetch(url, Object.assign({}, options, { headers }));
      } catch (err) {
        console.warn('[shopify] idToken() echec, fetch sans auth', err);
      }
    }
    return fetch(url, options);
  }

  // ============================================================
  // 1) Lecture du formulaire
  // ============================================================
  function readForm() {
    const fd = new FormData(form);
    const get = (n) => (fd.get(n) ?? '').toString().trim();

    const priceRaw = get('price').replace(',', '.');
    const oldRaw   = get('oldPrice').replace(',', '.');

    return {
      name:       get('name'),
      ref:        get('ref'),
      productUrl: get('productUrl'),
      price:      priceRaw === '' ? null : Number(priceRaw),
      oldPrice:   oldRaw   === '' ? null : Number(oldRaw),
      eyebrow:    get('eyebrow'),
      pitch:      get('pitch'),
      promo:      get('promo') === 'on',
      expo:       fd.get('expo') === 'on'
    };
  }

  // ============================================================
  // 2) Validation legere (juste pour activer/desactiver Imprimer
  //    et afficher un message s'il manque l'essentiel)
  // ============================================================
  function validate(d) {
    if (!d.name) return 'Le nom du produit est obligatoire.';
    if (d.price == null || isNaN(d.price)) return 'Le prix actuel est obligatoire.';
    if (d.price < 0) return 'Le prix doit etre positif.';
    if (d.oldPrice != null && (isNaN(d.oldPrice) || d.oldPrice < 0)) {
      return 'Le prix avant promo doit etre un nombre positif.';
    }
    if (d.promo && d.oldPrice != null && d.oldPrice <= d.price) {
      return 'En mode Promotion, le prix avant promo doit etre superieur au prix actuel.';
    }
    return null;
  }

  // ============================================================
  // 3) Helpers d'affichage
  // ============================================================
  const fmtPrice = (n) =>
    Number.isInteger(n)
      ? String(n)
      : n.toFixed(2).replace(/\.?0+$/, '').replace('.', ',');

  function discountPct(oldP, currP) {
    if (!oldP || !currP || oldP <= currP) return 0;
    return Math.round(((oldP - currP) / oldP) * 100);
  }

  // Generation QR code (URL produit Shopify ou autre).
  // Utilise la lib globale QRCode (chargee via CDN avec defer).
  // Si pas d'URL ou lib indispo : on vide le slot pour montrer le placeholder.
  function refreshQR(targetEl, url) {
    if (!targetEl) return;
    targetEl.innerHTML = '';
    if (!url || !/^https?:\/\//i.test(url)) return;
    if (typeof window.QRCode === 'undefined') {
      // Lib pas encore chargee : on retentera au prochain render
      return;
    }
    window.QRCode.toDataURL(url, {
      width: 600,
      margin: 0,
      errorCorrectionLevel: 'M',
      color: { dark: '#1E3A8A', light: '#ffffff' }
    }).then(dataUrl => {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.alt = 'QR code produit';
      targetEl.appendChild(img);
    }).catch(err => {
      console.warn('[qr] generation echouee', err);
    });
  }

  // ============================================================
  // 4) Construction de l'affiche dans #livePoster
  // ============================================================
  function buildPoster(data) {
    // Clone du template
    const clone = tplEl.content.firstElementChild.cloneNode(true);
    clone.id = 'livePoster';

    // Remplace le poster courant (ou l'append la 1ere fois).
    // On NE peut PAS utiliser la ref `livePoster` capturee a l'init :
    // apres un premier replaceWith elle pointe sur un noeud detache.
    const current = previewWrap.querySelector('.poster');
    if (current) current.replaceWith(clone);
    else previewWrap.appendChild(clone);

    // Modes
    clone.dataset.promo = data.promo ? 'true' : 'false';
    clone.dataset.expo  = data.expo  ? 'true' : 'false';

    // Texte editorial
    clone.querySelector('[data-eyebrow]').textContent = data.eyebrow || 'Coup de coeur';
    clone.querySelector('[data-name]').textContent    = data.name    || 'Nom du produit';
    clone.querySelector('[data-pitch]').textContent   = data.pitch   || 'Decouvrez nos nouveautes en magasin a Toulouse.';

    // Reference (cachee si absente)
    const refEl = clone.querySelector('[data-ref]');
    if (data.ref) {
      refEl.textContent = `Ref. ${data.ref}`;
      refEl.style.display = '';
    } else {
      refEl.textContent = '';
      refEl.style.display = 'none';
    }

    // Prix actuel (separe en entier/decimal)
    const priceIntEl = clone.querySelector('[data-price-int]');
    const priceDecEl = clone.querySelector('[data-price-dec]');
    const priceVal = data.price != null ? data.price : 0;
    
    // Formatage : on force 2 decimales si non-entier
    const formatted = priceVal.toFixed(2).replace(/\.?0+$/, '');
    const [intPart, decPart] = formatted.split('.');
    
    if (priceIntEl) priceIntEl.textContent = intPart;
    if (priceDecEl) {
      priceDecEl.textContent = decPart ? `,${decPart}` : '';
    }

    // Auto-shrink si le prix est trop long
    const totalChars = intPart.length + (decPart ? decPart.length : 0);
    const priceBlock = clone.querySelector('.poster__price');
    
    // On scale le font-size selon le nombre de caracteres reels
    if (totalChars >= 7) {
      priceBlock.style.fontSize = '0.45em';
    } else if (totalChars >= 6) {
      priceBlock.style.fontSize = '0.52em';
    } else if (totalChars >= 5) {
      priceBlock.style.fontSize = '0.65em';
    } else if (totalChars >= 4) {
      priceBlock.style.fontSize = '0.8em';
    } else {
      priceBlock.style.fontSize = '1em';
    }

    // Prix avant promo (visible seulement si data.promo + valeur)
    const oldEl = clone.querySelector('[data-old]');
    const oldBlock = oldEl.closest('.poster__old');
    if (data.promo && data.oldPrice != null && data.oldPrice > 0) {
      oldEl.textContent = fmtPrice(data.oldPrice);
      oldBlock.style.display = '';
    } else {
      oldBlock.style.display = 'none';
    }

    // Pastille -XX% (visible si promo + ancien prix > prix)
    const discEl = clone.querySelector('[data-discount]');
    const pct = discountPct(data.oldPrice, data.price);
    if (data.promo && pct > 0) {
      discEl.textContent = `-${pct}%`;
      discEl.style.display = '';
    } else {
      discEl.textContent = '';
      discEl.style.display = 'none';
    }

    // Footer mode (texte adapte si expo)
    const modeEl = clone.querySelector('[data-mode]');
    if (modeEl) modeEl.textContent = data.expo ? "Modele d'exposition" : 'En magasin';

    // QR code : générer si l'utilisateur a cliqué sur le bouton pour cette URL
    const qrSlot = clone.querySelector('[data-qr]');
    if (data.productUrl && data.productUrl === currentQrUrl) {
      refreshQR(qrSlot, data.productUrl);
    }
  }

  // ============================================================
  // 5) Mise a l'echelle de l'apercu (le poster fait 297mm de
  //    large, on le scale pour rentrer dans previewWrap)
  // ============================================================
  function applyPreviewScale() {
    const wrapW = previewWrap.clientWidth;
    if (!wrapW) return;
    const scale = wrapW / POSTER_PX_WIDTH;
    const poster = previewWrap.querySelector('.poster');
    if (!poster) return;
    poster.style.transform = `scale(${scale})`;
  }

  let resizeRO;
  function watchPreviewResize() {
    if ('ResizeObserver' in window) {
      resizeRO = new ResizeObserver(() => applyPreviewScale());
      resizeRO.observe(previewWrap);
    } else {
      window.addEventListener('resize', applyPreviewScale);
    }
  }

  // ============================================================
  // 6) Render complet (lecture + validation + build + scale)
  // ============================================================
  function render() {
    const data = readForm();
    const err  = validate(data);

    if (err) {
      errEl.textContent = err;
      errEl.hidden = false;
    } else {
      errEl.textContent = '';
      errEl.hidden = true;
    }

    // On reconstruit l'affiche meme avec une erreur (preview live)
    // Si pas de nom/prix on injecte des valeurs par defaut visuellement.
    const safe = {
      ...data,
      name:  data.name  || 'Nom du produit',
      price: data.price != null && !isNaN(data.price) ? data.price : 0
    };
    buildPoster(safe);
    applyPreviewScale();
  }

  // ============================================================
  // 7) Persistance localStorage (multi-onglets safe)
  // ============================================================
  function saveState() {
    const data = readForm();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_) { /* quota / private mode : on ignore */ }
  }

  function loadState() {
    let raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (_) { return; }
    if (!raw) return;
    let data;
    try { data = JSON.parse(raw); } catch (_) { return; }
    if (!data || typeof data !== 'object') return;

    // Reinjecte dans le formulaire
    const setVal = (name, val) => {
      const el = form.elements.namedItem(name);
      if (!el) return;
      if (el instanceof RadioNodeList) {
        for (const radio of el) radio.checked = radio.value === String(val);
      } else if (el.type === 'checkbox') {
        el.checked = !!val;
      } else {
        el.value = val == null ? '' : val;
      }
    };

    setVal('name',       data.name);
    setVal('ref',        data.ref);
    setVal('productUrl', data.productUrl);
    setVal('price',      data.price);
    setVal('oldPrice',   data.oldPrice);
    setVal('eyebrow',    data.eyebrow);
    setVal('pitch',      data.pitch);
    setVal('promo',      data.promo ? 'on' : 'off');
    setVal('expo',       data.expo);
  }

  // ============================================================
  // 8) Picker produit Shopify (encapsule dans un module)
  // ============================================================
  const ShopifyPicker = (() => {
    const root = document.querySelector('[data-shopify-picker]');
    if (!root) return { init: () => {} };

    const refs = {
      input:       root.querySelector('.picker__input'),
      results:     root.querySelector('[data-picker-results]'),
      chipImg:     root.querySelector('[data-picker-chip-img]'),
      chipTitle:   root.querySelector('[data-picker-chip-title]'),
      chipMeta:    root.querySelector('[data-picker-chip-meta]'),
      clear:       root.querySelector('[data-picker-clear]'),
      manualInput: root.querySelector('.picker__manual-input'),
      toggle:      root.querySelector('[data-picker-toggle]'),
      status:      root.querySelector('[data-picker-status]'),
      urlHidden:   root.querySelector('#f-product-url')
    };

    let configured = false;
    let shopName = null;
    let searchTimer = null;

    // ---- Helpers UI -----------------------------------------------------
    const escapeHtml = (s) =>
      String(s == null ? '' : s).replace(/[&<>"']/g, (m) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
      );

    function setState(s) {
      root.dataset.state = s;
      if (refs.toggle) {
        if (s === 'manual' && configured) {
          refs.toggle.textContent = 'Rechercher dans Shopify';
          refs.toggle.hidden = false;
        } else if (s === 'idle' || s === 'selected') {
          refs.toggle.textContent = 'Saisir une URL manuellement';
          refs.toggle.hidden = false;
        } else {
          refs.toggle.hidden = true;
        }
      }
    }

    function setStatus(text) {
      if (refs.status) refs.status.textContent = text;
    }

    // Met a jour le hidden URL et notifie app.js (saveState + render)
    function setUrl(url) {
      if (!refs.urlHidden) return;
      refs.urlHidden.value = url || '';
      form.dispatchEvent(new Event('input', { bubbles: false }));
    }

    // Pre-remplissage du formulaire depuis un produit Shopify.
    // Ecrase silencieusement les champs : c'est le but du picker.
    function autoFillFromProduct(p) {
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = (val == null || val === '') ? '' : val;
      };
      setVal('f-name',  p.title || '');
      setVal('f-ref',   p.sku   || '');
      setVal('f-price', p.price    != null ? p.price    : '');
      setVal('f-old',   p.oldPrice != null ? p.oldPrice : '');
    }

    // ---- Rendu des resultats -------------------------------------------
    function clearResults() {
      if (!refs.results) return;
      refs.results.innerHTML = '';
      refs.results.hidden = true;
    }

    function renderResults(products) {
      if (!refs.results) return;
      refs.results.innerHTML = '';
      if (!products.length) {
        const li = document.createElement('li');
        li.className = 'picker__result picker__result--empty';
        li.textContent = 'Aucun produit trouve.';
        refs.results.appendChild(li);
        refs.results.hidden = false;
        return;
      }
      for (const p of products) {
        const li = document.createElement('li');
        li.className = 'picker__result';
        li.setAttribute('role', 'option');
        li.tabIndex = 0;
        const priceTxt = p.price != null
          ? p.price.toString().replace('.', ',') + ' €'
          : '—';
        const skuTxt = p.sku ? escapeHtml(p.sku) + ' · ' : '';
        const imgHtml = p.image
          ? `<img class="picker__result-img" src="${escapeHtml(p.image)}" alt="" loading="lazy" />`
          : '<span class="picker__result-img picker__result-img--placeholder" aria-hidden="true"></span>';
        li.innerHTML = `
          ${imgHtml}
          <div class="picker__result-text">
            <strong>${escapeHtml(p.title)}</strong>
            <span>${skuTxt}${priceTxt}</span>
          </div>
        `;
        li.addEventListener('click', () => onSelect(p));
        li.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(p); }
        });
        refs.results.appendChild(li);
      }
      refs.results.hidden = false;
    }

    // ---- Selection produit ---------------------------------------------
    function onSelect(p) {
      setState('selected');
      // Chip
      if (refs.chipImg) {
        if (p.image) {
          refs.chipImg.src = p.image;
          refs.chipImg.style.display = '';
        } else {
          refs.chipImg.removeAttribute('src');
          refs.chipImg.style.display = 'none';
        }
      }
      if (refs.chipTitle) refs.chipTitle.textContent = p.title || 'Produit';
      if (refs.chipMeta) {
        const priceTxt = p.price != null ? p.price.toString().replace('.', ',') + ' €' : '';
        refs.chipMeta.textContent = [p.sku, priceTxt].filter(Boolean).join(' · ');
      }
      // Form values (autofill + URL)
      autoFillFromProduct(p);
      setUrl(p.url);
      clearResults();
      if (refs.input) refs.input.value = '';
    }

    // ---- Recherche -----------------------------------------------------
    async function doSearch(q) {
      try {
        const r = await shopifyFetch('/api/shopify/products?q=' + encodeURIComponent(q));
        if (!r.ok) { clearResults(); return; }
        const data = await r.json();
        renderResults(data.products || []);
      } catch (err) {
        console.warn('[picker] recherche echouee', err);
        clearResults();
      }
    }

    function onSearchInput() {
      clearTimeout(searchTimer);
      const q = (refs.input.value || '').trim();
      if (q.length < 1) { clearResults(); return; }
      searchTimer = setTimeout(() => doSearch(q), 250);
    }

    // ---- Bascules ------------------------------------------------------
    function onToggle() {
      if (root.dataset.state === 'manual') {
        setState('idle');
        clearResults();
        if (refs.input) { refs.input.value = ''; refs.input.focus(); }
      } else {
        setState('manual');
        if (refs.manualInput) {
          refs.manualInput.value = refs.urlHidden ? refs.urlHidden.value : '';
          refs.manualInput.focus();
        }
      }
    }

    function onClear() {
      setUrl('');
      if (refs.input) refs.input.value = '';
      if (refs.manualInput) refs.manualInput.value = '';
      clearResults();
      setState(configured ? 'idle' : 'manual');
    }

    function onManualInput() {
      setUrl((refs.manualInput.value || '').trim());
    }

    // ---- Init ----------------------------------------------------------
    async function init() {
      // Wiring evenements
      refs.input       && refs.input.addEventListener('input', onSearchInput);
      refs.toggle      && refs.toggle.addEventListener('click', onToggle);
      refs.clear       && refs.clear.addEventListener('click', onClear);
      refs.manualInput && refs.manualInput.addEventListener('input', onManualInput);

      // Ecoute du reset du formulaire pour vider le composant
      form.addEventListener('reset', () => {
        // setTimeout pour s'exécuter après le reset natif du navigateur
        setTimeout(() => {
          clearResults();
          setState(configured ? 'idle' : 'manual');
        }, 0);
      });

      // Recupere l'etat de la connexion Shopify
      try {
        const r = await shopifyFetch('/api/shopify/status');
        const status = await r.json();
        configured = !!status.configured;
        shopName = status.shop || null;
      } catch (_) {
        configured = false;
      }

      // Etat initial selon l'URL deja restauree par loadState()
      const savedUrl = (refs.urlHidden && refs.urlHidden.value) || '';
      if (savedUrl) {
        setState('manual');
        if (refs.manualInput) refs.manualInput.value = savedUrl;
      } else {
        setState(configured ? 'idle' : 'manual');
      }

      // Message de statut
      if (configured) {
        setStatus(`Connecte a ${shopName}. Choisis un produit ou saisis une URL.`);
      } else {
        setStatus("Shopify non connecte — saisis l'URL produit manuellement.");
      }
    }

    return { init };
  })();

  // ============================================================
  // 9) Wiring evenements
  // ============================================================
  function init() {
    loadState();
    render();
    watchPreviewResize();
    ShopifyPicker.init();

    // Render live a chaque changement
    form.addEventListener('input',  () => { saveState(); render(); });
    form.addEventListener('change', () => { saveState(); render(); });

    // Submit -> impression directe
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = readForm();
      const err  = validate(data);
      if (err) {
        errEl.textContent = err;
        errEl.hidden = false;
        return;
      }
      // Generer le QR code avant impression si URL fournie (pour être sûr)
      if (data.productUrl) {
        currentQrUrl = data.productUrl;
        render(); // Met à jour le DOM avec le QR code
      }
      // Petit timeout pour laisser le QR se generer et le DOM se stabiliser
      setTimeout(() => window.print(), 300);
    });

    // Reset -> on re-render avec valeurs vides + on efface le storage
    btnReset?.addEventListener('click', () => {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      currentQrUrl = null; // Réinitialise l'état du QR code
      // setTimeout pour laisser le form HTML se reset avant relecture
      setTimeout(render, 0);
    });

    // Bouton generer QR code
    const btnGenerateQR = document.getElementById('btn-generate-qr');
    if (btnGenerateQR) {
      btnGenerateQR.addEventListener('click', () => {
        const data = readForm();
        if (data.productUrl) {
          currentQrUrl = data.productUrl;
          render(); // Déclenche un rendu qui inclura le QR code
        } else {
          alert('Veuillez entrer une URL produit d\'abord.');
        }
      });
    }

    // Sync multi-onglets : si le storage change ailleurs, on reflete
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) {
        loadState();
        render();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
