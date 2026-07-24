/**
 * Shared TypeScript types for the Autonymous.me verifier-facing SDK.
 * Mirrors the REST API contracts defined in Technical_Specifications.docx, section 8.
 */

/** A W3C DID (Decentralized Identifier), e.g. "did:key:z6Mk...". */
export type Did = string;

/** Hex-encoded SHA-256 hash of a credential, 64 characters. */
export type CredentialHash = string;

export type CredentialStatus = "active" | "revoked" | "unknown";

export interface OpenId4VpRequestOptions {
  /** DID of the verifier making the request. */
  verifierDid: Did;
  /** What is being requested, e.g. "age_over_18", "full_credential". */
  presentationDefinitionId: string;
  /** Where the wallet should POST the VP Token back to. */
  responseUri: string;
  /** Opaque state the verifier wants echoed back with the response. */
  state?: string;
  /** Nonce for replay protection (generated server-side if omitted). */
  nonce?: string;
}

export interface OpenId4VpRequestResponse {
  /** The authorization request, either as a URI (openid4vp://...) or a JWT. */
  requestUri: string;
  /** The nonce actually used, for later verification against the response. */
  nonce: string;
  /** Server-assigned request id, used to poll/correlate the callback. */
  requestId: string;
}

/** Groth16 proof points, matching the zk_prover zome's ZkProofRecord shape. */
export interface Groth16Proof {
  piA: string[];
  piB: string[][];
  piC: string[];
  protocol: "groth16";
  curve: "bn128";
}

export interface ZkProofClaim {
  circuit: "age_check_v1";
  currentYear: number;
  credentialHash: CredentialHash;
  proof: Groth16Proof;
  publicSignals: string[];
  /** URI where the verifier can fetch the verification key for this circuit. */
  vkUri: string;
}

export interface VpTokenPayload {
  /** The raw SD-JWT presentation (RFC 9901) or equivalent. */
  vpToken: string;
  /** Echoed request state, must match what was sent in the request. */
  state?: string;
  /** Optional embedded zero-knowledge proof claim (e.g. age_check_v1). */
  zkProof?: ZkProofClaim;
}

export interface VpTokenVerificationResult {
  valid: boolean;
  holderDid?: Did;
  /** Reasons for failure, empty when valid === true. */
  errors: string[];
  /** Present when the presentation included a zk proof and it was checked. */
  zkProofValid?: boolean;
}

export interface DidResolutionResult {
  did: Did;
  /** W3C DID Document, minimally typed here (full shape is spec-defined). */
  didDocument: Record<string, unknown>;
  resolvedAt: string;
}

export interface CredentialStatusResult {
  credentialId: string;
  status: CredentialStatus;
  checkedAt: string;
  revokedAt?: string;
}

export interface AutonymousVerifierClientConfig {
  /** Base URL of the Autonymous.me verifier REST API, e.g. https://api.autonymous.me */
  baseUrl: string;
  /** API key issued to the verifier, sent as Authorization: Bearer <apiKey>. */
  apiKey?: string;
  /** Override fetch implementation (useful for tests / non-browser runtimes). */
  fetchImpl?: typeof fetch;
}
