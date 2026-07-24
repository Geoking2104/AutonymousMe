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

## Current status: DNA, Zomes, ZK circuit, SDK, and REST API implemented (alpha)

This repository has moved from specification to working code. What exists and is verified today:

- Three Holochain zomes (identity_wallet, openid4vp, zk_prover) written in Rust against HDK 0.4.1 / HDI 0.5.1. All three compile to wasm32-unknown-unknown in release mode and pass 13 integration tests (cargo test --workspace, zero failures).
- A real zk-SNARK circuit (circuits/age_check, Circom 2.1.4) proving age >= 18 without revealing date of birth. Verified end-to-end with a real Groth16 trusted setup: witness computed correctly at boundary conditions, proof generated, and cryptographically verified as valid.
- A verifier-facing TypeScript SDK (sdk/) wrapping the REST API and doing local, offline Groth16 proof verification via snarkjs. Compiles clean, 9 unit tests passing.
- A REST API (api/, Node/Express) implementing the OpenID4VP request/callback, DID resolution, and credential status endpoints from the technical spec. Compiles clean, 12 tests passing against an in-memory backend.

What is not yet done: a Holochain-backed implementation of the REST API (the adapter exists in api/src/backends/holochainBackend.ts but has not been run against a live conductor - no Holochain conductor process was available in the environment this was built in), the wallet UI (ui/ is carried over from an earlier prototype and has not been re-verified against the current zomes), and a production trusted setup for the zk circuit (the current Powers of Tau ceremony is dev-only, see circuits/age_check/README.md).

In short: the core logic is real, tested code, not scaffolding. The remaining gap to a shippable product is wiring the pieces together end-to-end against a live Holochain conductor and hardening the trusted setup.

If you are evaluating this project for a contribution, a partnership, or an eIDAS 2.0 compliance need: get in touch via [Issues](https://github.com/Geoking2104/AutonymousMe/issues) or support@autonymous.me.
---

## Table of contents

- [Current status](#current-status-dna-zomes-zk-circuit-sdk-and-rest-api-implemented-alpha)
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
  dnas/autonymous/
    dna.yaml
    zomes/
      identity_wallet/             - DID lifecycle, credential wallet, audit log (Rust/HDK)
      openid4vp/                   - OpenID4VP request/response flow (Rust/HDK)
      zk_prover/                   - zk proof storage/audit zome (Rust/HDK)
  circuits/age_check/              - Circom age>=18 circuit + Groth16 prove/verify scripts
  sdk/                             - Verifier-facing TypeScript SDK
  api/                             - REST API (Node/Express), spec section 8
  ui/                              - Wallet UI (prototype, not yet re-verified)
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

```bash
# Prerequisites: Rust + rustup, wasm32-unknown-unknown target
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release --workspace
cargo test --workspace
```

This builds identity_wallet.wasm, openid4vp.wasm, and zk_prover.wasm and runs all zome-level integration tests (13 passing). Running the full hApp against a live Holochain conductor (hc sandbox) has not yet been verified in this repository.

### Build and test the zk circuit

```bash
cd circuits/age_check
npm install
npm run compile
npm run test          # computes witness at boundary ages
npm run setup:phase2 && npm run prove && npm run verify
```

### Build and test the SDK and API

```bash
cd sdk && npm install && npm run build && npm test
cd ../api && npm install && npm run build && npm test
```
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
| 2 - Zomes, circuit, SDK, API | Done, unit/integration tested | identity_wallet, openid4vp, zk_prover zomes (13 tests passing); age_check circuit (real Groth16 proof verified); verifier SDK (9 tests); REST API (12 tests) |
| 3 - End-to-end integration | Not started | Wire the REST API to a live Holochain conductor (HolochainBackend adapter exists but is unverified); re-verify the wallet UI against the current zomes |
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
