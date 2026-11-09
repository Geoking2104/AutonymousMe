# Autonymous.me

> **Self-sovereign identity on Holochain · eIDAS 2.0 · OpenID4VP · Apache 2.0**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![eIDAS 2.0](https://img.shields.io/badge/eIDAS-2.0%20compliant-7B68EE)](https://eur-lex.europa.eu/eli/reg/2024/1183/oj)
[![OpenID4VP](https://img.shields.io/badge/OpenID4VP-v1.0%20Final-00C9A7)](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
[![W3C DID](https://img.shields.io/badge/W3C%20DID-1.0-E8A020)](https://www.w3.org/TR/did-core/)
[![Status](https://img.shields.io/badge/Status-v0.4--alpha-orange)](https://github.com/geoking2104/autonymous.me)

---

Autonymous.me is an **open-source, non-profit, community-governed protocol** for self-sovereign identity (SSI). It lets you prove who you are — your age, address, credentials — without handing over your personal data to any company, server, or database.

**No central database. No data brokers. No single point of failure.**

---

## Current status: migrated to Holochain 0.7 — DNA, Zomes, ZK circuit, SDK, REST API implemented and verified end-to-end against live conductors (0.6.1 and 0.7.1)

This repository has moved from specification to working, independently-verified code, and has been migrated from Holochain 0.4 to **Holochain 0.7** (kitsune2 + iroh/QUIC, action model `header`+`data`, hdk 0.7.1 / hdi 0.8.1, @holochain/client 0.21) — after an intermediate, fully-verified stop on 0.6 (merge #1):

- Three Holochain zomes (identity_wallet, openid4vp, zk_prover) written in Rust against HDK 0.7.1 / HDI 0.8.1. All three compile to wasm32-unknown-unknown in release mode (with the `--cfg getrandom_backend="custom"` flag) and pass 13 integration tests + clippy `-D warnings`. The 0.7 action-model rewrite is applied: `validate` callbacks flatten the `Op` (`op.flattened::<EntryTypes, LinkTypes>()`) and match on the typed `FlatOp::CreateEntry(OpEntry::CreateEntry { app_entry, .. })` — stricter than the old raw-bytes probing.
- A real zk-SNARK circuit (circuits/age_check, Circom 2.1.4) proving age >= 18 without revealing date of birth, verified with a real (dev-only) Groth16 trusted setup: witness correctness, proof generation, and cryptographic verification.
- A verifier-facing TypeScript SDK (sdk/), 9 passing unit tests, local offline zk proof verification via snarkjs.
- A REST API (api/, Node/Express) implementing the OpenID4VP request/callback, DID resolution, and credential status endpoints, 12 passing tests against an in-memory backend.
- A Holochain-backed implementation of that same REST API, **verified end-to-end against real conductors on both 0.6.1 and 0.7.1** (api/scripts/verify-conductor-06.mjs and verify-conductor-07.mjs — 13 checks each: real DID creation/read-back, audit-log writes, presentation recording/listing, real source-chain writes/reads). Note: `hc sandbox call` was removed in 0.7; the 0.7 script installs, enables and exercises the hApp purely over the admin/app websockets.
- **Multi-agent scenario (tests/)**: a Tryorama 2-agent scenario (community package `@holochain-open-dev/tryorama` 0.20) spins up two independent conductors on a mem network and runs the full holder flow on each — 12 checks, all green on 0.7.1.
- The DNA package lives in `dnas/core` (the legacy `dnas/autonomous` directory was removed after byte-identical confirmation). Manifests use `manifest_version: "0"` with `path:` fields as required by Holochain 0.5+.
- Self-hosted network infrastructure kit (infra/bootstrap/): docker-compose + runbook for `kitsune2-bootstrap-srv` (peer discovery / signalling), so production deployments do not depend on the rate-limited public dev-test servers.

What remains: the wallet UI (`ui/`) compiles (client 0.21, 0.5+ enum shapes, no nullable cap_secret) but has not yet been re-verified interactively against the current zomes; the zk circuit's trusted setup is dev-only and explicitly not production-safe (see circuits/age_check/README.md); Holochain 0.7 has no data-migration path, so this jump happened before any real user data existed (by design).

If you are evaluating this project for a contribution, a partnership, or an eIDAS 2.0 compliance need: get in touch via [Issues](https://github.com/Geoking2104/AutonymousMe/issues) or support@autonymous.me.
---

## Table of contents

- [Current status](#current-status-dna-zomes-zk-circuit-sdk-and-rest-api-implemented-and-verified-against-a-live-conductor)
- [Why it exists](#why-it-exists)
- [How it works](#how-it-works)
- [Architecture](#architecture)
- [Standards compliance](#standards-compliance)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Contributing](#contributing)
- [Community](#community)
- [Roadmap](#roadmap)
- [License](#license)

---

## Why it exists

The current online identity system is broken by design. In 2025 alone:

- **3,322 data compromises** in the US — a new all-time high (ITRC 2025)
- **278 million+ individuals** affected by breaches
- **66%** of breach notices exposed Social Security Numbers
- **$4.44M** average global cost per breach (IBM 2025)
- **277 days** average time to detect and contain a breach

Every time you prove your identity online, you hand over sensitive data to a private company that stores it, sells it, or loses it. Autonymous.me eliminates this model at the protocol level: your credentials live on your device, proofs are generated locally, and no personal data is ever transmitted to any server.

---

## How it works

Three steps. No technical knowledge required.

1. **Create your Digital ID** — Download the Autonymous.me hApp. Scan your official document once. A cryptographic DID is generated locally. The original scan is immediately deleted. Your ID never leaves your device.

2. **Choose what to share** — When a service sends an OpenID4VP request (QR code or deep link), you select exactly which SD-JWT claims to disclose. Only selected facts are included in the VP Token.

3. **Verified. Instantly.** — The service receives a cryptographic VP Token (dc+sd-jwt) — eIDAS 2.0 compliant — without receiving any of your underlying data. Every action is logged immutably on your Holochain Source Chain.

---

## Architecture

Six layers, each doing one thing well:

| Layer | Component | Standard |
|-------|-----------|----------|
| 6 | OpenID4VP — presentation protocol | eIDAS 2.0 |
| 5 | Autonymous.me hApp — local application | Holochain hApp |
| 4 | Verifiable Credentials — SD-JWT encoding | W3C VC 2.0 |
| 3 | Zero-Knowledge Proofs — zk-SNARKs | — |
| 2 | Decentralized Identifiers — DID keypairs | W3C DID 1.0 |
| 1 | Holochain — peer-to-peer network | Open source |

### No single point of failure

- All credential logic runs locally on the user's device
- No cloud call required for any verification step
- The Holochain DHT holds the issuer registry — distributed across peers
- Every VP presentation is logged on the user's own Source Chain
- Loss of any peer does not affect other peers' chains or credential validity

### Beyond eIDAS 2.0

eIDAS 2.0 requires a wallet, an issuer, and a verifier. Autonymous.me adds:

- **Zero-knowledge proofs** — prove age ≥ 18 without revealing date of birth
- **Tamper-proof Source Chain** — immutable self-sovereign audit log
- **No central server** — peer-to-peer, offline-capable
- **Open-source governance** — no company, no VC, Apache 2.0

---

## Standards compliance

| Standard | Reference |
|----------|-----------|
| W3C DID 1.0 | [w3.org/TR/did-core](https://www.w3.org/TR/did-core/) |
| W3C VC Data Model 2.0 | [w3.org/TR/vc-data-model-2.0](https://www.w3.org/TR/vc-data-model-2.0/) |
| OpenID4VP v1.0 Final | [openid.net/specs/openid-4-verifiable-presentations-1_0.html](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html) |
| SD-JWT RFC 9901 | [rfc-editor.org/rfc/rfc9901.html](https://www.rfc-editor.org/rfc/rfc9901.html) |
| eIDAS 2.0 — Reg. (EU) 2024/1183 | [eur-lex.europa.eu/eli/reg/2024/1183/oj](https://eur-lex.europa.eu/eli/reg/2024/1183/oj) |

---

## Project structure

```
AutonymousMe/
  Cargo.toml                       - Rust workspace manifest (3 zomes)
  happ.yaml                        - Holochain hApp manifest
  conductor-config.yaml            - Local conductor configuration
  Makefile, Dockerfile             - Build and container helpers
  dnas/core/                       - canonical DNA package (verified against a live 0.6.1 conductor)
    dna.yaml                       - manifest_version "0" (path: fields, no origin_time)
    zomes/
      identity_wallet/             - DID lifecycle, credential wallet, audit log (Rust/HDK 0.6.1)
      openid4vp/                   - OpenID4VP request/response flow (Rust/HDK 0.6.1)
      zk_prover/                   - zk proof storage/audit zome (Rust/HDK 0.6.1)
  circuits/age_check/              - Circom age>=18 circuit + Groth16 prove/verify scripts
  sdk/                             - Verifier-facing TypeScript SDK
  api/                             - REST API (Node/Express), spec section 8
    scripts/verify-conductor-06.mjs - 13-check live-conductor e2e scenario (0.6.1)
  ui/                              - Wallet UI (client updated to @holochain/client 0.20)
  scripts/copy-coordinator-wasms.mjs - distinct coordinator wasm copies for dna pack
  flake.nix                        - Holonix dev environment (main-0.6)
  package.json                     - root npm workspace (build:happ / package / test scripts)
  web-happ.yaml                    - web hApp manifest (UI + hApp bundle)
  index.html                       - Standalone marketing site
  autonymous-standalone.html       - Working copy of the standalone site
  Functional_Specifications.docx   - Functional specification
  Technical_Specifications.docx    - Technical specification
  README.md                        - This file
  LICENSE                          - Apache 2.0
  docs/
    happ-architecture.md           - hApp-level architecture notes
    architecture/                  - System diagram exports (v0.4-alpha)
      autonymous-architecture.drawio
      autonymous-architecture.drawio.xml
      autonymous-architecture.drawio.html
      autonymous-architecture.drawio.pdf
```

[View the interactive architecture diagram](docs/architecture/autonymous-architecture.drawio.html) - [PDF version](docs/architecture/autonymous-architecture.drawio.pdf)
---

## Getting started

### View the website locally

The project website is a fully self-contained single HTML file with no external dependencies. Open it directly in any browser:

```bash
git clone https://github.com/Geoking2104/AutonymousMe
cd AutonymousMe
open index.html   # macOS
# or: xdg-open index.html  (Linux)
# or: start index.html      (Windows)
```

### Build and test the Holochain zomes

The recommended toolchain is the Holonix Nix environment (see
[developer.holochain.org/get-started](https://developer.holochain.org/get-started/)):

```bash
nix develop                    # holochain 0.7.x, hc, node 22, binaryen
npm install                    # root workspace (ui, api, sdk, tests)
```

Without Nix (any OS with Rust + Node 22): download the `hc` and `holochain`
0.7.1 binaries from the [holochain releases](https://github.com/holochain/holochain/releases/tag/holochain-0.7.1)
and make sure they are on your PATH, then:

```bash
# Prerequisites: Rust + rustup, wasm32-unknown-unknown target
rustup target add wasm32-unknown-unknown

# 0.6+ requires the getrandom custom backend during wasm builds
RUSTFLAGS='--cfg getrandom_backend="custom"' \
  cargo build --release --target wasm32-unknown-unknown --workspace

cargo test --workspace          # 13 tests
node scripts/copy-coordinator-wasms.mjs
hc dna pack dnas/core/ --output dnas/core/core.dna
hc app pack . --output autonymous-me.happ
```

This builds identity_wallet.wasm, openid4vp.wasm, and zk_prover.wasm plus
their `_coordinator` copies, and packs the DNA and hApp bundles. On Windows,
native conductor runs are not supported — use WSL2 (the zomes still build
natively; only the conductor needs Linux).

### Build and test the zk circuit

```bash
cd circuits/age_check
npm install
npm run compile
npm run test          # computes witness at boundary ages
npm run setup:phase2 && npm run prove && npm run verify
```

### Run against a live conductor (end-to-end verification)

**Holochain 0.7** (recommended — `hc sandbox call` no longer exists; the script
does everything over the websockets, including install & enable):

```bash
# with the bundles built and holochain 0.7.1 on PATH (Linux/WSL for the conductor):
holochain --create-config
# set a fixed admin port (e.g. 9100) in the generated conductor-config.yaml, then:
echo pass | holochain --piped -c conductor-config.yaml &

# from api/ (Node 22):
cd api && npm ci
ADMIN_WS_URL=ws://localhost:9100 APP_WS_URL=ws://localhost:9000 \
  HAPP_PATH=../autonymous-me.happ node scripts/verify-conductor-07.mjs
```

**Holochain 0.6** (for environments still pinned there):

```bash
hc sandbox call --running <admin-port> install-app --app-id autonomous_me /abs/path/autonymous-me.happ
hc sandbox call --running <admin-port> enable-app autonomous_me
hc sandbox call --running <admin-port> add-app-ws 9000
cd api && node scripts/verify-conductor-06.mjs
```

Both scripts exercise: admin/app websocket connect, app auth token, signing
credentials, `create_did` → `get_my_did` → `get_audit_log` →
`record_presentation` → `list_presentations` → `list_zk_proofs`, asserting
real source-chain writes and reads (13 checks each).

### Multi-agent scenario (Tryorama)

```bash
# with holochain/hc/kitsune2-bootstrap-srv on PATH (they are spawned per-agent)
HAPP_PATH=/abs/path/autonymous-me.happ npm test --workspace tests
```

Two independent conductors on a mem network each run the full holder flow
(create_did → get_my_did → audit → record_presentation → list_presentations) —
12 checks.

### Self-hosted network infrastructure

See [infra/bootstrap/README.md](infra/bootstrap/README.md) for the
`kitsune2-bootstrap-srv` docker-compose kit and runbook (production hApps
should not rely on the public dev-test bootstrap servers).
---

## Contributing

All contributions are welcome. You don't need to be a developer.

### For developers

- Browse [open issues](https://github.com/geoking2104/autonymous.me/issues)
- Fork the repo, create a feature branch, submit a pull request
- Run tests before submitting: `npm test`
- Follow the coding style in `.editorconfig` (coming soon)

### For non-developers

- **Test the prototype** — open `index.html`, run the OpenID4VP demo, report what's confusing via [Issues](https://github.com/geoking2104/autonymous.me/issues)
- **Translate documentation** — open a PR with translations in `docs/i18n/`
- **Write about the project** — blog posts, conference talks, social media
- **Legal & regulatory** — eIDAS 2.0 compliance needs lawyers and policy experts

### Code of conduct

This project follows the [Contributor Covenant](https://www.contributor-covenant.org/) v2.1. Be respectful, be constructive, be direct.

---

## Community

| Channel | Link |
|---------|------|
| Issues & PRs | [github.com/geoking2104/autonymous.me](https://github.com/geoking2104/autonymous.me) |
| Contact | [support@autonymous.me](mailto:support@autonymous.me) |
| Website | [autonymous.me](https://geoking2104.github.io/autonymous.me) |

---

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| 1 - Core protocol design | Done | DID method, zk circuit design, SD-JWT schema - see Technical_Specifications.docx |
| 2 - Zomes, circuit, SDK, API | Done, unit/integration tested | identity_wallet, openid4vp, zk_prover zomes (13 tests + clippy clean); age_check circuit (real Groth16 proof verified); verifier SDK (9 tests); REST API (12 tests) — all on Holochain 0.7 (hdk 0.7.1 / hdi 0.8.1) |
| 3 - End-to-end integration | Done for the REST API / Holochain backend + multi-agent | HolochainBackend verified end-to-end against live conductors **0.6.1 and 0.7.1** (13-check scenarios: api/scripts/verify-conductor-06.mjs & verify-conductor-07.mjs); Tryorama 2-agent scenario (12 checks) on 0.7.1. Wallet UI (ui/) still needs interactive re-verification against the current zomes |
| 4 - Issuer registry & production trusted setup | Not started | DHT-based issuer registry; production-grade Powers of Tau ceremony (current one is dev-only) |
| 5 - Mobile app & governance | Planned | iOS/Android, community governance v1 |
| 6 - eIDAS 2.0 production | Planned | Certification, EUDI Wallet bridge |
---

## License

Copyright 2025 Autonymous.me Community

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for the full text.

```
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
```

---

*No rights reserved. Fork freely. Privacy is a right, not a feature.*
