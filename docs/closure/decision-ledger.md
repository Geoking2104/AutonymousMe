# AutonymousMe — Registre des décisions (clôture 2026-10-22)

Journal des décisions prises pour amener le dépôt à un état fermé et
vérifié. Chaque entrée est reconstructible : commit/PR référencés.

## D1 — Cible de migration : 0.6 d'abord (PR #1), puis 0.7 en fast-follow (PR #2)
**Pourquoi** : le guide get-started enseigne 0.6 (écosystème stabilisé :
kangaroo, tryorama, exemples) ; la 0.7 réécrit le modèle d'action
(callbacks validate) — deux sauts d'un coup multipliaient le risque sans
bénéfice. La 0.6 a été mergée et vérifiée avant d'entamer la 0.7.
**Alternative rejetée** : rester en 0.4 (réseau isolé, indéployable).

## D2 — Épinglage strict des versions HDK au conducteur
hdk/hdi épinglés `=` à la version exacte exigée par le conducteur cible
(0.6.1 puis 0.7.1). **Pourquoi** : un conducteur 0.6.1 rejette les wasms
compilés avec hdk 0.6.3 (imports hôtes inconnus — découvert empiriquement,
documenté dans le message de la PR #1). Retenir : toujours lire
`holochain --build-info` (`hdk_version_req`) avant de choisir la version hdk.

## D3 — Passphrase lair : conducteur piloté en `--piped` + port admin fixe
**Pourquoi** : `hc sandbox generate` se bloque sans TTY (le conducteur attend
la passphrase lair sur stdin) — vrai en local (PowerShell) comme en CI
(GitHub Actions). Contournement : `echo pass | holochain --piped -c <config>`
avec port admin fixé dans la config générée. Documenté dans le README et
l'en-tête des scripts de vérification.

## D4 — 0.7 : installation/activation du hApp par API admin uniquement
**Pourquoi** : `hc sandbox call` a été supprimé en 0.7. verify-conductor-07.mjs
attache l'interface app (attachAppInterface), installe depuis les bytes
(`source: {type:"bytes", value}` — attention : pas de champ `agent_key`, pas
de `bundle`), active (enableApp) puis exerce les zomes. Signature validée
contre les types TS du client 0.21.

## D5 — Tryorama : paquet communautaire @holochain-open-dev/tryorama
**Pourquoi** : en 0.7, Tryorama devient communautaire (changement de nom de
paquet npm). Le scénario 2 agents valide le flow holder sur 2 conducteurs
indépendants (mem network). Les entrées étant privées, rien ne doit croiser
la DHT — le test le prouve explicitement.

## D6 — Validation 0.7 par flatten + match typé (plus stricte)
Les callbacks `validate` réécrits : `op.flattened::<EntryTypes, LinkTypes>()?`
puis `FlatOp::CreateEntry(OpEntry::CreateEntry { app_entry, .. })`. Plus
strict que l'ancien probing SerializedBytes (les champs inconnus ne passent
plus inaperçus). Import : `hdi::flat_op::{FlatOp, OpEntry}` (pas dans le
prelude hdk 0.7).

## D7 — Tryorama/CI : binaires officiels GitHub releases plutôt que Nix en CI
**Pourquoi** : la CI GitHub Actions installe holochain/hc/kitsune2-bootstrap-srv
depuis les releases officielles (reproductible, rapide) ; le flake.nix reste
l'environnement de dev local recommandé (conforme au guide officiel).

## D8 — Suppression de dnas/autonomous (PR #1)
**Pourquoi** : sources byte-identiques à dnas/core (seule différence : encodage
de caractères dans des commentaires), le README le recommandait déjà ; la CI
packait encore le mauvais DNA — risque de publier un artefact jamais vérifié.

## D9 — Infra bootstrap : kit livré, déploiement différé
docker-compose + runbook sous infra/bootstrap/ (kitsune2-bootstrap_srv v0.3.2,
TLS Let's Encrypt, durcissement documenté). Le déploiement réel exige
serveur/domaine/certificats — décision utilisateur, donc différé.

## D10 — BOM UTF-8 : réparation en profondeur
12 fichiers trackés portaient un BOM (effet de bord de réécritures
PowerShell). Conséquence : vite/vitest ne parsait plus package.json
(« Unexpected token »). Réécriture sans BOM + note : éviter
`Set-Content -Encoding UTF8` (PowerShell 5 ajoute un BOM) pour les fichiers
consommés par Node.

## Différés explicites (acknowledged)
- UI wallet : re-vérification interactive (Phase 3).
- Exécutable kangaroo-electron + code signing (Phase 3).
- Cérémonie Powers of Tau production (Phase 5).
- Registre d'émetteurs DHT (Phase 4), eIDAS 2.0, mobile, gouvernance.
- Déploiement réel de l'infra bootstrap (serveur à fournir).
