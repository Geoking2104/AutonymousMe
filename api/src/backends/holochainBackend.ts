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
 * `identity_wallet`, `openid4vp`, and `zk_prover` zomes over the conductor's
 * app websocket.
 *
 * HONESTY NOTE: this class has been written against the zome function
 * signatures in dnas/autonymous/zomes/*, but has NOT been integration-tested
 * against a live `holochain` conductor process in this environment (no `hc`
 * sandbox / conductor binary is installed here — see docs/happ-architecture.md
 * and the zome-level `cargo test` results for what *has* been verified).
 * Treat this as a best-effort adapter that needs a real conductor + `hc sandbox`
 * run to confirm the exact zome call signatures before production use.
 *
 * Until that verification happens, `src/index.ts` defaults to InMemoryBackend
 * and only switches to this class when AUTONYMOUS_BACKEND=holochain is set
 * explicitly.
 */
export class HolochainBackend implements AutonymousBackend {
  constructor(
    private readonly appWs: AppWebsocket,
    private readonly roleName: string = "autonymous",
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
    // Maps to openid4vp::parse_authorization_request / an equivalent
    // "create request" coordinator function. The exact fn name/shape should
    // be confirmed against dnas/autonymous/zomes/openid4vp/src/lib.rs before
    // relying on this in production.
    return this.callZome<OpenId4VpRequestRecord>(
      "openid4vp",
      "create_authorization_request",
      body,
    );
  }

  async recordVpTokenCallback(
    requestId: string,
    vpToken: string,
  ): Promise<OpenId4VpRequestRecord | undefined> {
    return this.callZome<OpenId4VpRequestRecord | undefined>(
      "openid4vp",
      "record_presentation",
      { request_id: requestId, vp_token: vpToken },
    );
  }

  async getOpenId4VpRequest(
    requestId: string,
  ): Promise<OpenId4VpRequestRecord | undefined> {
    return this.callZome<OpenId4VpRequestRecord | undefined>(
      "openid4vp",
      "list_presentations",
      { request_id: requestId },
    );
  }

  async resolveDid(did: Did): Promise<DidDocumentResult | undefined> {
    return this.callZome<DidDocumentResult | undefined>(
      "identity_wallet",
      "get_my_did",
      { did },
    );
  }

  async getCredentialStatus(
    credentialId: string,
  ): Promise<CredentialStatusResult | undefined> {
    return this.callZome<CredentialStatusResult | undefined>(
      "identity_wallet",
      "get_credential",
      { credential_id: credentialId },
    );
  }
}