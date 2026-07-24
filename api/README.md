# @autonymous.me/api

REST API for Autonymous.me, implementing the endpoints from
Technical_Specifications.docx section 8:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/openid4vp/request` | Verifier starts an OpenID4VP presentation request |
| POST | `/api/v1/openid4vp/callback/:requestId` | Holder's wallet posts back its VP Token |
| GET | `/api/v1/openid4vp/request/:requestId` | Verifier polls request/response status |
| GET | `/api/v1/did/:did` | Resolve a DID to its DID Document |
| GET | `/api/v1/credential/:credentialId/status` | Check credential revocation status |
| GET | `/health` | Liveness check |

## Architecture

Routes depend only on the `AutonymousBackend` interface (`src/backend.ts`),
not on any specific storage. Two implementations exist:

- **`InMemoryBackend`** (`src/backends/inMemoryBackend.ts`) - the default.
  Used for local development and by the full test suite. State lives in
  process memory and is lost on restart.
- **`HolochainBackend`** (`src/backends/holochainBackend.ts`) - calls the
  `identity_wallet` and `zk_prover` zomes over a Holochain conductor's app
  websocket.

**Status: verified against a live conductor (2026-07-25).** `HolochainBackend`
was connected to a real `holochain` 0.4.1 conductor started via `hc sandbox`
(see `scripts/verify-conductor.mjs`). Confirmed working end-to-end: admin
websocket connect, app authentication token issuance, signing-credential
authorization, and real zome calls (`identity_wallet::create_did`,
`get_my_did`, `zk_prover::list_zk_proofs`) with real source-chain writes and
reads - not mocked.

That verification also corrected real bugs found only by running against a
live conductor: the `dna.yaml` manifest schema (`integrity_zomes`/
`coordinator_zomes` isn't valid for manifest_version "1" - it needs nested
`integrity: { zomes: [...] }` / `coordinator: { zomes: [...] }`), a resource
bundling conflict from reusing one wasm file for both a zome's integrity and
coordinator manifest entries, and a validation rule in the `openid4vp` zome
that rejects any `record_presentation` outcome other than `"approved"` or
`"denied"`.

It also surfaced an architectural mismatch worth knowing about: the real
`openid4vp` zome has no "create a pending request" function - only
`record_presentation` (the holder logging their own response) and
`list_presentations`. So `HolochainBackend.createOpenId4VpRequest` /
`getOpenId4VpRequest` track pending requests in memory (like
`InMemoryBackend` does) and only touch the chain once a response comes in via
`recordVpTokenCallback`. Similarly, `identity_wallet::get_my_did` returns the
connected agent's own DID with no arguments - there's no "resolve any DID by
string" capability, so `resolveDid` can only serve the local agent's own DID.

To run the API against a live conductor yourself:

```bash
# from the repo root, with dnas/core built and packed (see repo root README)
hc sandbox generate --in-process-lair --run=9000 --app-id autonomous_me autonomous_me.happ

# in another terminal, from api/
$env:AUTONYMOUS_BACKEND = "holochain"   # PowerShell; use export on bash/zsh
npm run dev
```

Env vars (all optional, defaults match the command above): `ADMIN_WS_URL`,
`APP_WS_URL`, `INSTALLED_APP_ID`, `ROLE_NAME`, `WS_ORIGIN`.

## Development

```bash
npm install
npm run dev     # tsx src/index.ts, in-memory backend by default
npm run build   # tsc -> dist/
npm test        # vitest + supertest, in-memory backend, no live server needed
```

## Example

```bash
curl -X POST http://localhost:3000/api/v1/openid4vp/request \
  -H "Content-Type: application/json" \
  -d '{
    "verifierDid": "did:key:zVerifierExample",
    "presentationDefinitionId": "age_over_18",
    "responseUri": "https://verifier.example.com/callback"
  }'
```
