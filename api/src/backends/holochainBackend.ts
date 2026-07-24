import { randomUUID, randomBytes } from "node:crypto";
import type { AppWebsocket } from "@holochain/client";
import type { AutonymousBackend } from "../backend.js";
import type {
  CredentialStatusResult,
  Did,
  DidDocumentResult,
  OpenId4VpRequestBody,
  OpenId4VpRequestRecord,
} from "../types.js";

/**
 * Holochain-backed implementation of AutonymousBackend, calling into the
 * `identity_wallet` and `zk_prover` zomes over the conductor's app websocket.
 *
 * VERIFIED 2026-07-25 against a live `holochain` 0.4.1 conductor started via
 * `hc sandbox`: connected an AdminWebsocket + AppWebsocket, authorized signing
 * credentials for the cell, and successfully called `identity_wallet::create_did`
 * and `identity_wallet::get_my_did` end-to-end (real DID written to and read
 * back from the source chain), plus `zk_prover::list_zk_proofs`.
 *
 * IMPORTANT ARCHITECTURAL FINDING from that verification: the real zome
 * function signatures do NOT match a naive 1:1 mapping of the REST API's
 * verifier-facing request/response model onto the holder's hApp:
 *
 * - There is no zome function to create/track a pending OpenID4VP request.
 *   `openid4vp::parse_authorization_request` / `record_presentation` /
 *   `list_presentations` are holder-side operations for the person
 *   RESPONDING to a request, not verifier-side request bookkeeping. So
 *   `createOpenId4VpRequest` and `getOpenId4VpRequest` are implemented here
 *   with the same in-memory bookkeeping as `InMemoryBackend` (there is
 *   nothing meaningful to call on-chain for "create a pending request").
 * - `record_presentation` expects `{ nonce, verifier, disclosed_claims,
 *   withheld_claims, vp_token, outcome }`, not `{ request_id, vp_token }`.
 *   `recordVpTokenCallback` maps the locally-tracked request's verifier/nonce
 *   plus the incoming token onto that real shape.
 * - `identity_wallet::get_my_did` takes no arguments and returns the DID of
 *   whichever agent this AppWebsocket is authenticated as ? there is no
 *   "resolve an arbitrary DID by string" capability in this zome. So
 *   `resolveDid` can only serve the *local* agent's own DID; it does not
 *   implement general-purpose DID resolution across the network.
 * - `identity_wallet::get_credential` takes the raw credential id as the
 *   payload directly (a bare string), not `{ credential_id }`.
 */
export class HolochainBackend implements AutonymousBackend {
  private readonly requests = new Map<string, OpenId4VpRequestRecord>();

  constructor(
    private readonly appWs: AppWebsocket,
    private readonly roleName: string = "autonomous",
  ) {}

  private async callZome<T>(
    zomeName: string,
    fnName: string,
    payload: unknown,
  ): Promise<T> {
    return this.appWs.callZome({
      role_name: this.roleName,
      zome_name: zomeName,
      fn_name: fnName,
      payload,
    }) as Promise<T>;
  }

  async createOpenId4VpRequest(
    body: OpenId4VpRequestBody,
  ): Promise<OpenId4VpRequestRecord> {
    // No on-chain equivalent (see class doc comment) ? tracked locally,
    // same as InMemoryBackend, until it is fulfilled and logged.
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

    // Log the real audit record on the holder's source chain via the
    // openid4vp zome, using its actual field shape.
    await this.callZome<unknown>("openid4vp", "record_presentation", {
      nonce: record.nonce,
      verifier: record.verifierDid,
      disclosed_claims: [record.presentationDefinitionId],
      withheld_claims: [],
      vp_token: vpToken,
      outcome: "approved",
    });

    record.vpToken = vpToken;
    record.status = "fulfilled";
    return record;
  }

  async getOpenId4VpRequest(
    requestId: string,
  ): Promise<OpenId4VpRequestRecord | undefined> {
    return this.requests.get(requestId);
  }

  /**
   * Returns the DID of the agent this AppWebsocket is authenticated as,
   * but only if it matches the requested `did`. See class doc comment:
   * `get_my_did` has no "resolve any DID" capability.
   */
  async resolveDid(did: Did): Promise<DidDocumentResult | undefined> {
    const myDid = await this.callZome<{ did: string } | null>(
      "identity_wallet",
      "get_my_did",
      null,
    );
    if (!myDid || myDid.did !== did) return undefined;
    return {
      did: myDid.did,
      didDocument: {
        "@context": ["https://www.w3.org/ns/did/v1"],
        id: myDid.did,
        verificationMethod: [],
      },
      resolvedAt: new Date().toISOString(),
    };
  }

  async getCredentialStatus(
    credentialId: string,
  ): Promise<CredentialStatusResult | undefined> {
    const result = await this.callZome<{
      credential: { revoked: boolean };
    } | null>("identity_wallet", "get_credential", credentialId);
    if (!result) return undefined;
    return {
      credentialId,
      status: result.credential.revoked ? "revoked" : "active",
      checkedAt: new Date().toISOString(),
      revokedAt: result.credential.revoked
        ? new Date().toISOString()
        : undefined,
    };
  }
}

