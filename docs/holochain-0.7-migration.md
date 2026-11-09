# Holochain 0.7 migration and Phase 4 integration

Updated: 2026-11-09 (integrated onto main via PR #2 0.7.1 baseline; Tryorama issuer-registry slice green)

## Compatibility baseline

This repository follows the official Holochain 0.7 compatibility table:

| Component | Version |
|---|---:|
| Holochain conductor / `hc` | 0.7.0 |
| HDK | 0.7.0 |
| HDI | 0.8.0 |
| `@holochain/client` | 0.21.0 |
| Lair keystore | 0.7.1 |
| Kitsune2 bootstrap service | 0.5.0 |

Primary references:

- https://developer.holochain.org/resources/compatibility/holochain-0.7/
- https://developer.holochain.org/resources/upgrade/upgrade-holochain-0.7/
- https://developer.holochain.org/build/validate-callback/
- https://developer.holochain.org/build/links-paths-and-anchors/

## Phase 1-3 review outcomes

- Rust dependencies moved from HDK 0.4.1 / HDI 0.5.1 to HDK 0.7.0 / HDI
  0.8.0, including the serialized-bytes version required by the entry macros.
- The WASM target selects HDK's custom `getrandom` backend in
  `.cargo/config.toml`, as required by the 0.7 toolchain.
- Entry validation was migrated from direct `Op::StoreEntry` matching to the
  0.7 `FlatOp` API. Presentation and proof records are append-only.
- The JavaScript client was moved to 0.21.0. Admin-issued app authentication
  tokens, the new discriminated `CellInfo` shape, and the current
  `AppWebsocket.connect` options object are used.
- The conductor configuration no longer contains the removed WebRTC signal
  settings. It uses separate bootstrap/relay authentication material and the
  Iroh-compatible network shape.
- DNA packaging now uses the canonical `dnas/core` manifest. Coordinator WASM
  copies have distinct resource paths, which the manifest packer requires.
  Both DNA and hApp manifests use schema version `0` and `path` resources;
  the obsolete `origin_time` modifier has been removed.
- hApp identity is consistent across the manifest and clients:
  `autonymous_me` (installed app) and `autonymous` (role).

Holochain 0.7 does not provide a database migration path from the older stack.
Delete or move only the dedicated development conductor state after backing up
anything important, then install the newly packed hApp into fresh state.

## Phase 4 vertical slice

`issuer_registry` adds a public DHT entry and global link index. The entry is
self-certifying: the `did:hc` identifier and controller must match the authoring
agent. Records and index links are immutable. The zome exposes:

- `register_issuer`
- `get_issuer`
- `list_issuers`

The REST API exposes the same flow under `/api/v1/issuers`; the verifier SDK
and wallet client include typed register/get/list methods.

This is deliberately a discovery directory, not a claim that an issuer is
legally or operationally trusted. Production Phase 4 still requires:

- governance/accreditation and trust-list assertions;
- issuer key rotation, supersession, and revocation semantics;
- multi-agent, multi-peer conductor tests for DHT convergence;
- authorization and abuse/rate controls for the public REST endpoint;
- production Groth16 Powers of Tau ceremony and signed artifact publication;
- a fresh Holochain 0.7 live-conductor verification run.
