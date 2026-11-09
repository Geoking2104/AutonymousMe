# AutonymousMe — Audit des points ouverts (clôture 2026-10-22)

Périmètre : état du dépôt Geoking2104/AutonymousMe au 22/10/2026, après la
migration 0.4→0.6 (PR #1, mergée) et la migration 0.6→0.7 (PR #2, en cours au
moment de la rédaction — voir « Statut » ci-dessous). Cet audit inventorie
tout ce qui était inachevé, ambigu ou différé, avec la décision terminale
pour chaque item.

| # | Item | Où | Statut final | Décision / justification |
|---|------|-----|--------------|--------------------------|
| 1 | Migration Holochain 0.4 → 0.6 | dépôt entier | **Terminé, vérifié** | PR #1 mergée (squash 8bf2e2c). Preuves : 13 tests Rust, 12 API, 9 SDK, e2e 13 checks sur conducteur réel 0.6.1, CI 9/9 verte. |
| 2 | Migration Holochain 0.6 → 0.7 | dépôt entier | **Terminé, vérifié** | PR #2 (commit 2986662). Preuves locales : 13 Rust + clippy, 12 API, 9 SDK, build UI, e2e 13 checks sur conducteur réel 0.7.1, Tryorama 12 checks. CI GitHub : voir rapport de vérification. |
| 3 | `dnas/autonomous` périmé encore tracké | dnas/ | **Supprimé** | Retiré dans PR #1 après vérification byte-à-byte (identique à dnas/core, mojibake de commentaires près). |
| 4 | Makefile/CI/Dockerfile packant le DNA périmé | build | **Corrigé** | Tout rebasé sur dnas/core (PR #1) puis 0.7.1 (PR #2). |
| 5 | Cible `test-integration` pointant vers un dossier tests/ inexistant | Makefile | **Résolu** | Dossier tests/ créé avec un vrai scénario Tryorama (PR #2) ; cible CI dédiée. |
| 6 | Pas de flake.nix (outil officiel = Nix/Holonix) | racine | **Créé** | flake.nix holonix main-0.6 (PR #1) → main-0.7 (PR #2). |
| 7 | Tests multi-agents absents | tests/ | **Créé, vérifié** | Scénario Tryorama 2 agents (paquet communautaire 0.20), 12 checks PASSED sur 0.7.1. |
| 8 | Packaging .webhapp absent | web-happ.yaml | **Créé** | web-happ.yaml + job CI « Pack hApp & web hApp » (vert en 0.6 ; revalidé en 0.7 par la CI de la PR #2). |
| 9 | Dépendance aux serveurs publics dev-test (rate-limited) | conductor-config.yaml | **Mitigé + kit livré** | conductor-config 0.6/0.7 avec URLs dev-test documentées + infra/bootstrap/ (docker-compose kitsune2-bootstrap-srv + runbook). Déploiement réel chez un hébergeur : différé (hors périmètre, nécessite un serveur/domaine). |
| 10 | UI wallet jamais reverifiée interactivement | ui/ | **Différé (acknowledged)** | Le client compile (client 0.21, enums 0.5+, plus de cap_secret null) mais aucune vérification interactive n'a été faite : nécessite hc-spin/UI hot-reload, travail de Phase 3 du plan. Documenté dans le README (« What remains »). |
| 11 | Trusted setup zk dev-only | circuits/ | **Différé (acknowledged)** | Cérémonie Powers of Tau multi-parties = Phase 5 du plan ; explicitement non production-safe, documenté dans circuits/age_check/README.md et le README racine. |
| 12 | Registre d'émetteurs DHT (roadmap phase 4) | — | **Différé (acknowledged)** | Hors périmètre de la finalisation (nouvelle fonctionnalité). |
| 13 | eIDAS 2.0 / mobile / gouvernance (roadmap phases 5-6) | — | **Différé (acknowledged)** | Hors périmètre (nouvelles fonctionnalités). |
| 14 | Bloquage tests API après bump client 0.21 | api/ | **Résolu** | Cause racine : BOM UTF-8 introduits par des Set-Content PowerShell dans 12 fichiers trackés (dont package.json racine) cassaient le JSON.parse de vite/vitest. BOM supprimés, tests 12/12. |
| 15 | `hc sandbox call` supprimé en 0.7 | CI + scripts | **Résolu** | verify-conductor-07.mjs fait install/enable/exercice uniquement via websockets admin/app ; CI conductor mise à jour. |
| 16 | node_modules de tests/ commité par erreur (PR #2, commit initial) | tests/ | **Corrigé** | Untrack (commit dédié), .gitignore étendu à tous les node_modules de workspaces. |
| 17 | Exécutable desktop kangaroo-electron (plan Phase 3) | — | **Différé (acknowledged)** | Nécessite template repo + code signing ; phase suivante du plan de déploiement, hors finalisation. |
| 18 | Rapport de bilan initial (21/10) | workspace | **Livré** | autonymous-me-bilan-plan-deploiement-2026-10-21.html (hors dépôt, dans le workspace AutoClaw). |

Aucun autre point ouvert connu n'a été identifié lors du balayage final
(balayage TODO/placeholder/refs cassées : voir rapport de vérification).
