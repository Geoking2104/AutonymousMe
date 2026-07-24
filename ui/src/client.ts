/**
 * Autonymous.me — Holochain UI client
 *
 * Wraps all zome calls with typed interfaces.
 * Connects to the local Holochain conductor via WebSocket.
 *
 * Usage:
 *   const client = await AutonClient.connect();
 *   const did    = await client.createDid("banking");
 *   const creds  = await client.listCredentials();
 */

import {
  AppWebsocket,
  type InstalledAppId,
  type ActionHash,
  type AgentPubKey,
} from "@holochain/client";

// ─────────────────────────────────────────── TYPES ─────────────────────────

export interface DidRecord {
  did: string;
  context: string;
  created_at: string;
  active: boolean;
}

export interface StoredCredential {
  id: string;
  credential_type: string;
  label: string;
  issuer_did: string;
  token: string;
  available_claims: string;  // JSON array string
  issued_at: string;
  expires_at?: string;
  revoked: boolean;
}

export interface CredentialWithHash {
  action_hash: ActionHash;
  credential: StoredCredential;
}

export interface AuditEntry {
  action_type: string;
  description: string;
  metadata: string;
  timestamp: string;
}

export interface AuditEntryWithHash {
  action_hash: ActionHash;
  entry: AuditEntry;
}

export interface AuthorizationRequest {
  nonce: string;
  client_id: string;
  presentation_definition: string;
  response_mode: string;
  redirect_uri?: string;
  raw_request: string;
  received_at: string;
  status: string;
}

export interface ParseRequestOutput {
  action_hash: ActionHash;
  request: AuthorizationRequest;
  required_claims: string[];
}

export interface BuildVpTokenOutput {
  vp_token: string;
  disclosed: string[];
  withheld: string[];
  nonce: string;
}

export interface PresentationRecord {
  nonce: string;
  verifier: string;
  disclosed_claims: string;
  withheld_claims: string;
  vp_token_prefix: string;
  presented_at: string;
  outcome: string;
}

export interface PresentationRecordWithHash {
  action_hash: ActionHash;
  record: PresentationRecord;
}

// ─────────────────────────────────────────── CLIENT ────────────────────────

const CONDUCTOR_URL   = "ws://localhost:8888";
const APP_ID: InstalledAppId = "autonymous-me";
const DNA_ROLE        = "autonymous";

export class AutonClient {
  private ws: AppWebsocket;
  private myPubKey: AgentPubKey;

  private constructor(ws: AppWebsocket, myPubKey: AgentPubKey) {
    this.ws = ws;
    this.myPubKey = myPubKey;
  }

  /** Connect to the local Holochain conductor. */
  static async connect(url = CONDUCTOR_URL): Promise<AutonClient> {
    const ws = await AppWebsocket.connect(url);
    const info = await ws.appInfo({ installed_app_id: APP_ID });
    if (!info) throw new Error(`hApp '${APP_ID}' is not installed`);
    const myPubKey = info.agent_pub_key;
    return new AutonClient(ws, myPubKey);
  }

  get agentPubKey(): AgentPubKey {
    return this.myPubKey;
  }

  // ── Identity Wallet zome ─────────────────────────────────────────────────

  /** Create a new DID for the given context. */
  async createDid(context: string): Promise<{ did: string; action_hash: ActionHash }> {
    return this.call("identity_wallet", "create_did", { context });
  }

  /** Return the agent's current active DID. */
  async getMyDid(): Promise<DidRecord | null> {
    return this.call("identity_wallet", "get_my_did", null);
  }

  /**
   * Import a Verifiable Credential (SD-JWT) into the local wallet.
   * The token is stored privately on the agent's Source Chain.
   */
  async importCredential(params: {
    credential_type: string;
    label: string;
    issuer_did: string;
    token: string;
    available_claims: string[];
    issued_at: string;
    expires_at?: string;
  }): Promise<{ id: string; action_hash: ActionHash }> {
    return this.call("identity_wallet", "import_credential", params);
  }

  /** List all non-revoked credentials in the wallet. */
  async listCredentials(): Promise<CredentialWithHash[]> {
    return this.call("identity_wallet", "list_credentials", null);
  }

  /** Retrieve a single credential by ID. */
  async getCredential(id: string): Promise<CredentialWithHash | null> {
    return this.call("identity_wallet", "get_credential", id);
  }

  /** Revoke a credential. */
  async revokeCredential(id: string): Promise<ActionHash> {
    return this.call("identity_wallet", "revoke_credential", { credential_id: id });
  }

  /** Return the full Source Chain audit log. */
  async getAuditLog(): Promise<AuditEntryWithHash[]> {
    return this.call("identity_wallet", "get_audit_log", null);
  }

  // ── OpenID4VP zome ───────────────────────────────────────────────────────

  /**
   * Parse an openid4vp:// URI (from QR scan or deep link).
   * Returns the parsed request and the list of required claims.
   */
  async parseAuthorizationRequest(raw: string): Promise<ParseRequestOutput> {
    return this.call("openid4vp", "parse_authorization_request", { raw });
  }

  /**
   * Build a VP Token from the stored credential and user-selected disclosures.
   *
   * The resulting vp_token is in dc+sd-jwt format:
   *   <issuer_jwt>~<disclosed_disc1>~<disclosed_disc2>~<kb_jwt>
   */
  async buildVpToken(params: {
    nonce: string;
    credential_id: string;
    sd_jwt_token: string;
    disclosed_claims: string[];
    all_claims: string[];
  }): Promise<BuildVpTokenOutput> {
    return this.call("openid4vp", "build_vp_token", params);
  }

  /**
   * Record the outcome of a presentation on the Source Chain.
   * Call this after delivering the VP Token to the verifier.
   */
  async recordPresentation(params: {
    nonce: string;
    verifier: string;
    disclosed_claims: string[];
    withheld_claims: string[];
    vp_token: string;
    outcome: "approved" | "denied";
  }): Promise<ActionHash> {
    return this.call("openid4vp", "record_presentation", params);
  }

  /** List all presentation records from the Source Chain. */
  async listPresentations(): Promise<PresentationRecordWithHash[]> {
    return this.call("openid4vp", "list_presentations", null);
  }

  // ── High-level flow helpers ───────────────────────────────────────────────

  /**
   * Full OpenID4VP flow in one call:
   *   1. Parse the QR/deep-link request
   *   2. Find matching credentials
   *   3. Build the VP Token with selected disclosures
   *   4. Record the presentation on Source Chain
   *   Returns the VP Token to be delivered to the verifier.
   */
  async runOpenId4VpFlow(params: {
    raw_request: string;
    credential_id: string;
    disclosed_claims: string[];
  }): Promise<{ vp_token: string; nonce: string; disclosed: string[]; withheld: string[] }> {
    // Step 1: parse request
    const parsed = await this.parseAuthorizationRequest(params.raw_request);

    // Step 2: load credential
    const credWithHash = await this.getCredential(params.credential_id);
    if (!credWithHash) {
      throw new Error(`Credential ${params.credential_id} not found`);
    }
    const cred = credWithHash.credential;
    const allClaims: string[] = JSON.parse(cred.available_claims);

    // Step 3: build VP Token
    const result = await this.buildVpToken({
      nonce:             parsed.request.nonce,
      credential_id:     params.credential_id,
      sd_jwt_token:      cred.token,
      disclosed_claims:  params.disclosed_claims,
      all_claims:        allClaims,
    });

    // Step 4: record on Source Chain
    await this.recordPresentation({
      nonce:            result.nonce,
      verifier:         parsed.request.client_id,
      disclosed_claims: result.disclosed,
      withheld_claims:  result.withheld,
      vp_token:         result.vp_token,
      outcome:          "approved",
    });

    return result;
  }

  /**
   * Deny an OpenID4VP request and log the denial on Source Chain.
   */
  async denyRequest(raw_request: string): Promise<void> {
    const parsed = await this.parseAuthorizationRequest(raw_request);
    await this.recordPresentation({
      nonce:            parsed.request.nonce,
      verifier:         parsed.request.client_id,
      disclosed_claims: [],
      withheld_claims:  [],
      vp_token:         "",
      outcome:          "denied",
    });
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private async call<T>(zome: string, fn_name: string, payload: unknown): Promise<T> {
    const result = await this.ws.callZome({
      cap_secret:    null,
      role_name:     DNA_ROLE,
      zome_name:     zome,
      fn_name,
      payload,
      provenance:    this.myPubKey,
    });
    return result as T;
  }
}

// ─────────────────────────────────────────── EXPORT ────────────────────────
export default AutonClient;
