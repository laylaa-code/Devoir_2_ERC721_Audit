# Devoir 2 — Certification académique ERC-721

Ce projet reprend le système de certification académique du devoir 1 en utilisant des NFT ERC-721. Chaque certificat a un `tokenId` unique et une fiche de métadonnées accessible par `tokenURI`.

J'ai ajouté les rôles d'administration, la révocation, les tests de sécurité et un petit rapport d'audit. L'interface reste en React .

## Outils

Solidity 0.8.20, Hardhat, OpenZeppelin, React, Vite, ethers.js, MetaMask et SheetJS.

## Installation

Dans le dossier principal du Devoir 2 :

```powershell
npm install
npm run compile
npm run test
```

Installer ensuite les dépendances du frontend :

```powershell
cd frontend
npm install
cd ..
```

Les dépendances doivent être installées avec une connexion Internet avant d'utiliser le projet en local.

## Lancer le projet en local

Ouvrir trois terminaux PowerShell dans VS Code.

**Terminal 1 — Blockchain**

```powershell
npm run node
```

**Terminal 2 — Déploiement**

```powershell
npm run deploy
```

**Terminal 3 — Interface**

```powershell
cd frontend
npm run dev
```

Ouvrir `http://127.0.0.1:5173/` dans Chrome. Dans MetaMask, utiliser `localhost 8545` (Chain ID `31337`) et le premier compte de test Hardhat, qui a les rôles administrateur et émetteur.

Si le devoir 1 est encore lancé, arrêter son ancien nœud Hardhat avant de démarrer celui du devoir 2. Un redémarrage du nœud local efface les certificats de la séance : redéployer le contrat avec `npm run deploy`.

## Utilisation

Dans la zone administrateur, on peut :

- créer un certificat à partir du formulaire ;
- importer `examples/etudiants.xlsx`, choisir les lignes et émettre un lot ;
- révoquer un certificat par son identifiant (administrateur uniquement).

La zone publique permet de saisir un identifiant et de consulter les informations, le statut, le `tokenId` et le `tokenURI`.

Si l'adresse du destinataire reste vide dans le formulaire ou le fichier Excel, le NFT est envoyé au portefeuille MetaMask connecté.

Le contrat utilise `MINTER_ROLE` pour les émissions et `DEFAULT_ADMIN_ROLE` pour les révocations. Les CNE ne peuvent pas être enregistrés deux fois.

**Format utilisé pour le batch :** la fonction `batchMintCertificates(address[] to, string[] uris)` attend chaque entrée `uris` sous la forme `CNE|URI`. Le frontend prépare automatiquement ce format afin que le contrat puisse contrôler l'unicité des CNE même dans les lots.

## Tests et audit

```powershell
npm run test
```

Le fichier `audit/mini_rapport_audit.md` résume les risques vérifiés, les tests et les limites. Après l'exécution des tests, reporter leur résultat dans ce fichier.

## Sepolia (livrable complémentaire du sujet)

Le sujet demande aussi une **adresse Sepolia et une transaction d'exemple**. Le déploiement local ne les remplace pas. Pour ce déploiement, il faut une connexion Internet, un RPC Sepolia et un portefeuille contenant des SepETH de test.

Avec les variables d'environnement suivantes définies localement dans PowerShell :

```powershell
$env:SEPOLIA_RPC_URL = "VOTRE_URL_RPC_SEPOLIA"
$env:SEPOLIA_PRIVATE_KEY = "VOTRE_CLE_PRIVEE_DE_TEST"
npm run deploy:sepolia
```

Le script affiche le hash de déploiement et enregistre les informations dans `deployments/sepolia.json`. Les valeurs réelles doivent être ajoutées au livrable après ce déploiement. L'interface fournie ici est configurée pour **Hardhat Local**.


