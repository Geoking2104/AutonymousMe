import type {
  CredentialStatusResult,
  Did,
  DidDocumentResult,
  IssuerRecord,
  OpenId4VpRequestBody,
  OpenId4VpRequestRecord,
  RegisterIssuerBody,
} from "./types.js";

/**
 * Storage/compute boundary between the Express routes and wherever the data
 * actually lives (Holochain conductor, or an in-memory store for local dev
 * and tests). Routes never talk to Holochain directly, they only depend on
 * this interface, so the two backends below are interchangeable.
 */
export interface AutonymousBackend {
  createOpenId4VpRequest(
    body: OpenId4VpRequestBody,
  ): Promise<OpenId4VpRequestRecord>;

  recordVpTokenCallback(
    requestId: string,
    vpToken: string,
  ): Promise<OpenId4VpRequestRecord | undefined>;

  getOpenId4VpRequest(
    requestId: string,
  ): Promise<OpenId4VpRequestRecord | undefined>;

  resolveDid(did: Did): Promise<DidDocumentResult | undefined>;

  getCredentialStatus(
    credentialId: string,
  ): Promise<CredentialStatusResult | undefined>;

  registerIssuer(body: RegisterIssuerBody): Promise<IssuerRecord>;

  getIssuer(issuerDid: Did): Promise<IssuerRecord | undefined>;

  listIssuers(): Promise<IssuerRecord[]>;
}
