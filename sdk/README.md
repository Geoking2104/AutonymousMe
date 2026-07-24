# @autonymous.me/verifier-sdk

Verifier-facing TypeScript SDK for Autonymous.me. Implements requirement
**FR-VER-02** from the technical specification: a relying party (verifier)
integration surface, distinct from the wallet-side client shipped in
`ui/src/client.ts`.

## What this is for

A verifier (e.g. a bar checking age, an exchange checking KYC status) uses
this SDK from its own backend to:

1. Start an OpenID4VP presentation request and get back a `requestUri` to
   show the holder's wallet as a QR code or deep link.
2. Receive the wallet's VP Token response (via the verifier's own callback
   endpoint) and check it with `verifyVpToken`.
3. Optionally verify an embedded zero-knowledge proof (currently
   `age_check_v1`, matching `circuits/age_check`) fully offline via
   `verifyZkProof`, using snarkjs against a published verification key.
4. Resolve DIDs and check credential revocation status directly against the
   API.

## Install

```bash
npm install @autonymous.me/verifier-sdk
```

## Usage

```ts
import { AutonymousVerifierClient } from "@autonymous.me/verifier-sdk";

const client = new AutonymousVerifierClient({
  baseUrl: "https://api.autonymous.me",
  apiKey: process.env.AUTONYMOUS_API_KEY,
});

const { requestUri, requestId } = await client.initiateRequest({
  verifierDid: "did:key:zVerifierExample",
  presentationDefinitionId: "age_over_18",
  responseUri: "https://verifier.example.com/callback",
});

// ... render requestUri as a QR code, wait for the wallet's callback POST ...

const result = await client.verifyVpToken({
  vpToken: receivedVpToken,
  zkProof: receivedZkProofClaim, // optional
});

if (!result.valid) {
  console.error("Presentation rejected:", result.errors);
}
```

## Scope and honesty notes

- `verifyVpToken` checks structure and (if present) the zk proof locally.
  Full SD-JWT issuer-signature verification requires the issuer's key
  material and is expected to be done server-side by the Autonymous.me API;
  this SDK does not re-implement SD-JWT/JWS crypto client-side in this pass.
- `verifyZkProof` is fully local and does not require trusting the API: it
  fetches the circuit's verification key from `vkUri` and runs
  `snarkjs.groth16.verify` directly, mirroring
  `circuits/age_check/scripts/verify.js`.
- Only the `age_check_v1` circuit is supported today, matching what actually
  exists in `circuits/age_check`.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # vitest, unit tests only, no live server required
```