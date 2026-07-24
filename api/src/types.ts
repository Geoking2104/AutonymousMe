/** Shared types for the Autonymous.me REST API. Mirrors sdk/src/types.ts on the wire. */

export type Did = string;

export type CredentialStatus = "active" | "revoked" | "unknown";

export interface OpenId4VpRequestBody {
  verifierDid: Did;
  presentationDefinitionId: string;
  responseUri: string;
  state?: string;
  nonce?: string;
}

export interface OpenId4VpRequestRecord {
  requestId: string;
  verifierDid: Did;
  presentationDefinitionId: string;
  responseUri: string;
  state?: string;
  nonce: string;
  createdAt: string;
  /** Populated once the wallet posts its VP Token back. */
  vpToken?: string;
  status: "pending" | "fulfilled" | "expired";
}

export interface VpTokenCallbackBody {
  vpToken: string;
  state?: string;
}

export interface DidDocumentResult {
  did: Did;
  didDocument: Record<string, unknown>;
  resolvedAt: string;
}

export interface CredentialStatusResult {
  credentialId: string;
  status: CredentialStatus;
  checkedAt: string;
  revokedAt?: string;
}