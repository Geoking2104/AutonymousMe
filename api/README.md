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

- **`InMemoryBackend`** (`src/backends/inMemoryBackend.ts`) — the default.
  Used for local development and by the full test suite. State lives in
  process memory and is lost on restart.
- **`HolochainBackend`** (`src/backends/holochainBackend.ts`) — calls the
  `identity_wallet`, `openid4vp`, and `zk_prover` zomes over a Holochain
  conductor's app websocket.

**Status note:** `HolochainBackend` is written against the zome function
signatures in `dnas/autonymous/zomes/*`, but has not been integration-tested
against a live `holochain` conductor in this environment (no `hc` sandbox /
conductor binary was available here). It is intentionally not wired up in
`src/index.ts` yet — selecting it currently throws with an explicit message
rather than silently no-op-ing. Wiring it up for real requires: running
`hc sandbox` (or equivalent) locally, confirming the exact zome fn
names/payload shapes against the current zome source, and then completing
the `AppWebsocket` connection logic in `src/index.ts`.

## Development

```bash
npm install
npm run dev     # tsx src/index.ts, in-memory backend, hot-reload-free dev server
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