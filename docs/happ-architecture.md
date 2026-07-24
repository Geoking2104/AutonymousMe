# Autonymous.me — Technical Architecture

## Overview

Autonymous.me is a Holochain hApp implementing a self-sovereign identity wallet compliant with eIDAS 2.0 via the OpenID4VP protocol. All identity logic runs locally on the user's device. No central server is involved in any verification flow.

---

## Data flows

### 1. Credential issuance

```
Issuer                    User Device (hApp)              Holochain DHT
  │                              │                               │
  │── Signs SD-JWT VC ──────────▶│                               │
  │                              │── create_entry(Credential) ──▶│ (private)
  │                              │── log_audit(vc_imported) ─────▶│ (private)
  │                              │                               │
```

The issuer signs a Verifiable Credential in SD-JWT format and delivers it to the wallet. The wallet stores it as a **private entry** on the user's Source Chain. The issuer keeps no copy.

### 2. OpenID4VP verification

```
Verifier           User Device (hApp)                Holochain DHT
   │                      │                                │
   │── OID4VP request ───▶│                                │
   │   (QR / deep link)   │── resolve verifier DID ───────▶│
   │                      │◀── DID document ───────────────│
   │                      │                                │
   │                      │  [User selects claims]         │
   │                      │                                │
   │                      │── build_vp_token()             │
   │                      │   SD-JWT selective disclosure  │
   │                      │   KB-JWT (holder binding)      │
   │                      │                                │
   │◀── VP Token ─────────│                                │
   │    (dc+sd-jwt)        │── log_audit(presentation) ───▶│ (private)
   │                      │                                │
   │── Verify signature    │                                │
   │   Check nonce         │                                │
   │   Grant access ──────▶│                                │
```

### 3. Source Chain integrity

Each Source Chain entry contains:
- `header`: action type, timestamp, author public key
- `prev_action`: hash of the previous entry (tamper detection)
- `entry_hash`: hash of the entry content
- `signature`: author's Ed25519 signature

Any modification to any entry breaks the hash chain. Holochain peers validate the chain structure using shared DNA rules.

---

## SD-JWT format

Autonymous.me uses the `dc+sd-jwt` format specified in RFC 9901.

### Structure

```
<issuer_jwt>~<disclosure_1>~<disclosure_2>~<kb_jwt>
```

Where:
- `issuer_jwt`: `header.payload.signature` — the original credential from the issuer
- `disclosure_N`: `base64url([salt, claim_name, claim_value])` — one per disclosed claim
- `kb_jwt`: Key Binding JWT — proves the holder is presenting (not replaying)

### Issuer JWT payload example

```json
{
  "iss": "did:hc:uhCAkMinistryOfInterior",
  "iat": 1700000000,
  "exp": 1731536000,
  "_sd_alg": "sha-256",
  "_sd": [
    "hash_of_age_disclosure",
    "hash_of_name_disclosure",
    "hash_of_country_disclosure"
  ]
}
```

The `_sd` array contains SHA-256 hashes of all available disclosures. The verifier can only see disclosures that the holder explicitly includes in the presentation.

### Disclosure example

A disclosure for `age_gte_18 = true`:
```
base64url(["<random_salt>", "age_gte_18", true])
```

If the user does not include this disclosure, the verifier sees only its hash — not its value.

### Key Binding JWT

```json
{
  "alg": "EdDSA",
  "typ": "kb+jwt"
}
.
{
  "nonce": "<verifier_nonce>",
  "aud": "<verifier_client_id>",
  "iat": <current_time>
}
.
<holder_signature>
```

The holder's Ed25519 signature (from their Holochain keypair) over the KB-JWT header+payload proves ownership.

---

## DID method: `did:hc`

Format: `did:hc:<agent_pub_key_base64url>`

The DID is derived from the Holochain agent's Ed25519 public key, which is managed by the Lair keystore. Resolution:

1. Extract the agent public key from the DID string
2. Look up the DID document on the Holochain DHT
3. Return the public key and service endpoints

### Context-specific DIDs

For unlinkability across services, each use context gets a distinct DID. In MVP this uses the same keypair with a context suffix. In v1.1 each context will use a separate keypair to prevent correlation.

---

## Zome API reference

### identity_wallet

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `create_did` | `{ context }` | `{ did, action_hash }` | Create a new DID |
| `get_my_did` | — | `DidRecord?` | Get active DID |
| `import_credential` | `ImportCredentialInput` | `{ id, action_hash }` | Store SD-JWT VC |
| `list_credentials` | — | `CredentialWithHash[]` | List wallet contents |
| `get_credential` | `id: string` | `CredentialWithHash?` | Get credential by ID |
| `revoke_credential` | `{ credential_id }` | `ActionHash` | Mark credential revoked |
| `get_audit_log` | — | `AuditEntryWithHash[]` | Source Chain log |

### openid4vp

| Function | Input | Output | Description |
|----------|-------|--------|-------------|
| `parse_authorization_request` | `{ raw }` | `ParseRequestOutput` | Parse OID4VP URI |
| `build_vp_token` | `BuildVpTokenInput` | `BuildVpTokenOutput` | Build dc+sd-jwt VP Token |
| `record_presentation` | `RecordPresentationInput` | `ActionHash` | Log to Source Chain |
| `list_presentations` | — | `PresentationRecordWithHash[]` | All presentations |

---

## Security properties

| Property | How achieved |
|----------|-------------|
| **No central database** | All data is private entries on the user's Source Chain |
| **Tamper-proof log** | Hash-linked Source Chain, peer-validated |
| **Selective disclosure** | SD-JWT: each claim is individually disclosable |
| **No issuer tracking** | Issuer is not contacted during verification |
| **No verifier correlation** | Context-specific DIDs; nonce prevents replay |
| **Holder binding** | KB-JWT signed by agent keypair |
| **Offline capable** | All verification logic runs locally |
| **No single point of failure** | Distributed Holochain DHT; no coordinator |

---

## eIDAS 2.0 compliance mapping

| eIDAS 2.0 requirement | Autonymous.me implementation |
|-----------------------|------------------------------|
| Digital identity wallet | Autonymous.me hApp |
| Verifiable Credentials | SD-JWT VC (dc+sd-jwt) |
| OpenID4VP protocol | `openid4vp` zome |
| Selective disclosure | SD-JWT disclosures, user-controlled |
| Holder binding | KB-JWT with Ed25519 |
| DID-based identity | `did:hc` method |
| Audit logging | Holochain Source Chain |

---

## Roadmap: upcoming protocol changes

### v0.5 — Issuer Registry
- DHT-based public issuer registry (DNA entry type: `IssuerRegistration`)
- Issuer DID resolution from DHT
- Trust level tiers: self-issued / community / institutional

### v0.6 — Context-specific keypairs
- Each context DID uses a separate Lair-managed keypair
- Prevents correlation across services at the cryptographic level

### v1.0 — zk-SNARKs
- Age proofs via zk-SNARK circuit (Groth16 over BN254)
- No raw claim value transmitted even in approval path
- Circuit: `prove(x): x >= 18` without revealing `x`
