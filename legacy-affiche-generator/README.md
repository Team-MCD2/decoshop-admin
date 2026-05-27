# DecoShop — Generateur d'etiquettes de vente

Outil web pour generer et imprimer des etiquettes papier dans le magasin DecoShop Toulouse.

## Fonctionnalites

- Formulaire simple : nom du produit, prix, prix avant promo, badge **EXPO**
- Apercu en direct de l'etiquette
- Planche d'impression A4 (6 etiquettes par feuille)
- Sauvegarde automatique dans le navigateur (localStorage) — pas de risque de perdre la planche
- Respect de la **DA DecoShop** : couleurs (`#1E3A8A` navy / `#FACC15` jaune / `#FAF7F0` cream), polices Playfair Display + DM Sans, logo officiel
- 100 % offline (apres premier chargement)

## Stack

- **Backend** : Node.js + Express (serveur statique)
- **Frontend** : HTML + CSS + Vanilla JS (zero framework, zero build)
- **Impression** : `window.print()` + `@media print` CSS

## Installation

Pre-requis : Node.js >= 18 ([nodejs.org](https://nodejs.org)).

```powershell
cd "d:\PROBOOK 445 G7\Desktop\STAGE MICRODIDAC\deco2\generateur"
npm install
```

## Lancer

```powershell
npm start
```

Puis ouvrir [http://localhost:3000](http://localhost:3000) dans le navigateur.

Pour le mode developpement (auto-reload a chaque modif) :

```powershell
npm run dev
```

## Utilisation au magasin

1. Lancer `npm start`
2. Ouvrir `http://localhost:3000` dans Chrome ou Firefox
3. Remplir le formulaire (nom + prix + ancien prix optionnel + cocher **EXPO** si applicable)
4. Cliquer sur **Ajouter a la planche**
5. Repeter pour chaque produit
6. Quand la planche est complete (6 max), cliquer sur **Imprimer la planche**
7. Boite de dialogue d'impression du navigateur → choisir l'imprimante
8. Decouper a la cisaille

## Structure du dossier

```
generateur/
├── package.json          (deps: express, nodemon)
├── server.js             (serveur Express)
├── README.md
├── .gitignore
└── public/
    ├── index.html        (UI principale)
    ├── styles.css        (DA DecoShop)
    └── app.js            (logique JS)
```

## Le logo

Le serveur sert `/assets/logo.png` depuis `../theme/assets/logo.png` (le logo officiel du theme Shopify). Pas besoin de dupliquer le fichier.

Si tu deplaces le dossier `generateur/` ailleurs (sans le voisin `theme/`), copie le logo dans `public/logo.png` — le serveur l'utilisera en fallback automatique.

## Format des etiquettes

- **Taille unitaire** : 99 × 99 mm (carre)
- **Planche** : A4 portrait, 2 colonnes × 3 lignes = 6 etiquettes
- **Marges** : 7 mm autour de chaque etiquette

Les etiquettes sont prevues pour etre **decoupees a la cisaille** apres impression.

## Personnalisation

Toutes les couleurs sont definies dans `public/styles.css` (variables CSS `--navy`, `--yellow`, etc.). Modifie ce fichier pour ajuster la DA.

Le HTML de l'etiquette est dans `public/index.html` (template `#labelTemplate`).
