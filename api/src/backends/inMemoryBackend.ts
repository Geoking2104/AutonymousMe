import { randomUUID, randomBytes } from "node:crypto";
import type { AutonymousBackend } from "../backend.js";
import type {
  CredentialStatusResult,
  Did,
  DidDocumentResult,
  IssuerRecord,
  OpenId4VpRequestBody,
  OpenId4VpRequestRecord,
  RegisterIssuerBody,
} from "../types.js";

/**
 * In-memory implementation of AutonymousBackend. Used for local development
 * and for the test suite so tests don't need a running Holochain conductor.
 * Not suitable for production: state is lost on restart and not shared
 * across processes.
 */
export class InMemoryBackend implements AutonymousBackend {
  private readonly requests = new Map<string, OpenId4VpRequestRecord>();
  private readonly revokedCredentials = new Set<string>();
  private readonly knownCredentials = new Set<string>();
  private readonly issuers = new Map<string, IssuerRecord>();

  /** Test/dev helper: seed a credential so status checks have something real to answer. */
  seedCredential(credentialId: string, revoked = false): void {
    this.knownCredentials.add(credentialId);
    if (revoked) this.revokedCredentials.add(credentialId);
  }

  async createOpenId4VpRequest(
    body: OpenId4VpRequestBody,
  ): Promise<OpenId4VpRequestRecord> {
    const record: OpenId4VpRequestRecord = {
      requestId: randomUUID(),
      verifierDid: body.verifierDid,
      presentationDefinitionId: body.presentationDefinitionId,
      responseUri: body.responseUri,
      state: body.state,
      nonce: body.nonce ?? randomBytes(16).toString("hex"),
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    this.requests.set(record.requestId, record);
    return record;
  }

  async recordVpTokenCallback(
    requestId: string,
    vpToken: string,
  ): Promise<OpenId4VpRequestRecord | undefined> {
    const record = this.requests.get(requestId);
    if (!record) return undefined;
    record.vpToken = vpToken;
    record.status = "fulfilled";
    return record;
  }

  async getOpenId4VpRequest(
    requestId: string,
  ): Promise<OpenId4VpRequestRecord | undefined> {
    return this.requests.get(requestId);
  }

  async resolveDid(did: Did): Promise<DidDocumentResult | undefined> {
    if (!did.startsWith("did:")) return undefined;
    // Minimal synthetic DID Document; a real backend resolves this via the
    // identity_wallet zome's DID record (see dnas/.../identity_wallet).
    return {
      did,
      didDocument: {
        "@context": ["https://www.w3.org/ns/did/v1"],
        id: did,
        verificationMethod: [],
      },
      resolvedAt: new Date().toISOString(),
    };
  }

  async getCredentialStatus(
    credentialId: string,
  ): Promise<CredentialStatusResult | undefined> {
    if (!this.knownCredentials.has(credentialId)) return undefined;
    const revoked = this.revokedCredentials.has(credentialId);
    return {
      credentialId,
      status: revoked ? "revoked" : "active",
      checkedAt: new Date().toISOString(),
      revokedAt: revoked ? new Date().toISOString() : undefined,
    };
  }

  async registerIssuer(body: RegisterIssuerBody): Promise<IssuerRecord> {
    const id = randomUUID();
    const issuer: IssuerRecord = {
      actionHash: `memory:${id}`,
      issuerDid: `did:hc:dev-${id}`,
      displayName: body.displayName,
      credentialTypes: [...body.credentialTypes],
      verificationMethod: body.verificationMethod,
      controller: `dev-${id}`,
      registeredAt: new Date().toISOString(),
    };
    this.issuers.set(issuer.issuerDid, issuer);
    return issuer;
  }

  async getIssuer(issuerDid: Did): Promise<IssuerRecord | undefined> {
    return this.issuers.get(issuerDid);
  }

  async listIssuers(): Promise<IssuerRecord[]> {
    return [...this.issuers.values()];
  }
}
