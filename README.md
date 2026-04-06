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

## Table of contents

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
autonymous.me/
├── index.html          # Full standalone website (no external dependencies)
├── README.md           # This file
├── LICENSE             # Apache 2.0
├── CONTRIBUTING.md     # Contribution guidelines (coming soon)
├── GOVERNANCE.md       # Community governance model (coming soon)
└── docs/               # Technical specifications (coming soon)
    ├── did-method.md
    ├── openid4vp-flow.md
    └── sd-jwt-schema.md
```

---

## Getting started

### View the website locally

The project website is a fully self-contained single HTML file with no external dependencies. Open it directly in any browser:

```bash
git clone https://github.com/geoking2104/autonymous.me
cd autonymous.me
open index.html   # macOS
# or: xdg-open index.html  (Linux)
# or: start index.html      (Windows)
```

### Run the prototype hApp (coming in Phase 4)

```bash
# Prerequisites: Node.js 18+, Holochain conductor
git clone https://github.com/geoking2104/autonymous.me
cd autonymous.me
npm install
npm run dev
# → Holochain conductor started
# → DID wallet initialized
# → OpenID4VP handler ready
# → hApp running at localhost:8080
```

### Issue a test SD-JWT credential

```bash
autonymous.me vc issue --type age --value 25 --format sd-jwt
# → SD-JWT credential signed and stored locally

autonymous.me openid4vp verify --preset kyc-age
# → VP Token generated: dc+sd-jwt
# → Logged to Source Chain: QmVP9f...
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
| 1 — Core protocol design | ✅ Complete | DID method, zk circuits, SD-JWT schema |
| 2 — Alpha wallet (desktop) | ✅ Complete | Key management, credential import, Source Chain UI |
| 3 — OpenID4VP integration | ✅ Complete | Full flow, dc+sd-jwt, holder binding |
| 4 — Issuer registry & integrations | 🔄 In progress | DHT registry, REST API, browser extension |
| 5 — Mobile app & governance | 📋 Planned Q3 2025 | iOS/Android, community governance v1 |
| 6 — eIDAS 2.0 production | 📋 Planned 2026 | Certification, EUDI Wallet bridge |

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
