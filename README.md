# Jev Exposure Radar

Trace incident-to-position dependency paths, calculate a conservative exposure bound, and replay only information known at the selected time.

[![CI](https://github.com/gbesse/jev-exposure-radar/actions/workflows/ci.yml/badge.svg)](https://github.com/gbesse/jev-exposure-radar/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**Research prototype · read-only · synthetic demo included.** This is working software, not evidence of profitable trading or validated model superiority. The UI and detailed usage notes are in French. No wallet or financial execution is implemented.

## Quick start

Node.js 22 or later. No dependencies to install.

```bash
git clone https://github.com/gbesse/jev-exposure-radar.git
cd jev-exposure-radar
npm start
```

Open <http://127.0.0.1:4319>. The server binds to loopback only. Use `PORT=4320 npm start` to choose another port.

## Utilisation

Le scénario initial est entièrement fictif. Modifier les paramètres, inspecter les preuves et exporter le dossier JSON. Pour analyser ses données, télécharger l’exemple dans l’interface, le compléter puis l’importer. [data/demo.json](data/demo.json) documente le format `exposure` ; importer cet objet ou un dossier exporté précédemment. Les changements restent dans la page ; recharger restaure la démonstration.


- `nodes`: identifiant, nom, `coverageComplete` déclaré.
- `edges`: `from`, `to`, `kind`, `fraction`, `evidence`, `observedAt`.
- `positions`: identifiant de position, nœud détenu, `valueUsd`, `observedAt`.
- `incidents`: identifiant, cible, titre, `status` (`confirmed`, `alleged`, `benign`), preuve, `publishedAt`, `observedAt`, éventuellement `resolvedAt`.

Une `allocation` pondère la fraction détenue. Une `dependency` porte sur toute la branche (`fraction: 1`). Les fractions se multiplient le long des chemins. Les chemins et incidents peuvent se recouper : leur somme est plafonnée par position pour produire une **borne haute**, sans prétendre connaître exactement leurs intersections. Le résultat n’est pas une perte attendue.

Le graphe doit être acyclique ; les allocations sortantes ne dépassent pas 100 %. Les liens et incidents non encore observés sont exclus du replay. Les incidents résolus ou bénins sont exclus des alertes. Les valorisations sont celles fournies, pas des prix historiques reconstitués. Fournir un snapshot de graphe valable à l’instant étudié : cette version ne gère pas encore les changements d’allocation, les liens supprimés et leurs périodes de validité. `coverageComplete` est déclaratif ; aucun chemin connu ne prouve l’absence de risque.


## Jev, en option

Les moteurs fonctionnent sans clé. Copier `.env.example` vers `.env`, définir `TYPESAFE_API_KEY`, puis démarrer avec :

```bash
node --env-file=.env src/server.js
```

La clé reste côté serveur. Les textes saisis sont envoyés à TypeSafe uniquement lorsque vous cliquez sur « Évaluer avec Jev ». La classification d’incident envoie aussi les noms des cibles proposées. Les jugements restent séparés de la validation des données : Jev ne certifie ni les clauses ni la réalité d’un incident, et ne modifie pas les analyses automatiquement.

L’adaptateur utilise la [System One API](https://docs.typesafe.ai/api), avec `jev-1.13.0` par défaut. Les distributions sont validées ; les reçus incluent modèle demandé/résolu, empreinte de requête et latence. Une erreur ne devient jamais un résultat fictif. Aucun appel réel à Jev n’a été exécuté à la publication, faute de clé configurée.

## Sources publiques

Le catalogue DeFiLlama affiche 25 protocoles présents sur Ethereum, hors CEX, triés par TVL globale toutes chaînes. Il a été vérifié en direct à la création. Ce catalogue ne constitue pas un graphe des dépendances du portefeuille.

## Tests et évaluation

```bash
npm test
npm run check
npm run eval                        # plan seulement, aucun appel
node --env-file=.env src/evaluate.js --live --max-calls 4
```

Le jeu d’évaluation contient quatre cas synthétiques. L’option `--live` réalise des appels fournisseur potentiellement payants, plafonnés par `--max-calls`. Les labels ne sont pas transmis au modèle. Le rapport `output/jev-evaluation.json` contient exactitude, Brier multiclasse, couverture et exactitude au seuil de confiance. Il ne mesure pas une calibration financière sur données réelles. Un échec interrompt l’exécution ; la reprise et les checkpoints ne sont pas encore implémentés.

[Protocole de recherche et limites](docs/RESEARCH.md) · [Contribuer](CONTRIBUTING.md) · [Sécurité](SECURITY.md)

## Licence

[MIT](LICENSE). Projet indépendant, sans affiliation revendiquée avec TypeSafe ou les fournisseurs de données.

Projet compagnon : [jev-contract-graph](https://github.com/gbesse/jev-contract-graph).
