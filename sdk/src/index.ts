import type {
  AutonymousVerifierClientConfig,
  CredentialStatusResult,
  Did,
  DidResolutionResult,
  OpenId4VpRequestOptions,
  OpenId4VpRequestResponse,
  VpTokenPayload,
  VpTokenVerificationResult,
  ZkProofClaim,
} from "./types.js";

/**
 * Thrown when the verifier REST API returns a non-2xx response.
 */
export class AutonymousApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `Autonymous.me API error (HTTP ${status})`);
    this.name = "AutonymousApiError";
  }
}

/**
 * Verifier-facing SDK for Autonymous.me (FR-VER-02).
 *
 * This client is distinct from the wallet-side client in `ui/src/client.ts`:
 * it is meant to run on a *verifier's* backend (a relying party checking a
 * user's credentials), not inside the holder's wallet. It wraps the REST API
 * described in Technical_Specifications.docx section 8:
 *
 *   POST /api/v1/openid4vp/request
 *   GET  /api/v1/did/{did}
 *   GET  /api/v1/credential/{credentialId}/status
 *
 * Structural zk-SNARK proof verification (Groth16/BN128) is done locally via
 * snarkjs against a verification key fetched from `vkUri`, so a verifier does
 * not need to trust the API server's own judgment about proof validity.
 */
export class AutonymousVerifierClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: AutonymousVerifierClientConfig) {
    if (!config.baseUrl) {
      throw new Error("AutonymousVerifierClient: baseUrl is required");
    }
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  /**
   * Kick off an OpenID4VP presentation request. Returns a request URI the
   * verifier should render as a QR code / deep link for the holder's wallet.
   */
  async initiateRequest(
    options: OpenId4VpRequestOptions,
  ): Promise<OpenId4VpRequestResponse> {
    return this.post<OpenId4VpRequestResponse>(
      "/api/v1/openid4vp/request",
      options,
    );
  }

  /**
   * Resolve a DID to its DID Document via the API's resolver.
   */
  async resolveDid(did: Did): Promise<DidResolutionResult> {
    return this.get<DidResolutionResult>(
      `/api/v1/did/${encodeURIComponent(did)}`,
    );
  }

  /**
   * Check whether a credential has been revoked.
   */
  async checkCredentialStatus(
    credentialId: string,
  ): Promise<CredentialStatusResult> {
    return this.get<CredentialStatusResult>(
      `/api/v1/credential/${encodeURIComponent(credentialId)}/status`,
    );
  }

  /**
   * Verify a VP Token returned by a wallet in response to an OpenID4VP
   * request. This only performs structural / claim-shape checks locally
   * (issuer DID resolution + credential status); actual SD-JWT signature
   * verification is expected to happen server-side in the API, since it
   * requires the issuer's public key material. Callers who need offline
   * verification should use `verifyZkProof` directly against the embedded
   * proof, which is fully local.
   */
  async verifyVpToken(payload: VpTokenPayload): Promise<VpTokenVerificationResult> {
    const errors: string[] = [];

    if (!payload.vpToken || payload.vpToken.length === 0) {
      errors.push("vpToken is empty");
    }

    let zkProofValid: boolean | undefined;
    if (payload.zkProof) {
      try {
        zkProofValid = await this.verifyZkProof(payload.zkProof);
        if (!zkProofValid) {
          errors.push("zk proof failed local verification");
        }
      } catch (err) {
        errors.push(
          `zk proof verification threw: ${err instanceof Error ? err.message : String(err)}`,
        );
        zkProofValid = false;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      zkProofValid,
    };
  }

  /**
   * Verify a Groth16 zk-SNARK proof (e.g. the age_check_v1 circuit) locally
   * using snarkjs, fetching the verification key from `claim.vkUri`.
   *
   * This mirrors `circuits/age_check/scripts/verify.js` but is generic over
   * any circuit that publishes a standard snarkjs verification key.
   */
  async verifyZkProof(claim: ZkProofClaim): Promise<boolean> {
    if (claim.circuit !== "age_check_v1") {
      throw new Error(`Unsupported circuit: ${claim.circuit}`);
    }
    if (
      !claim.proof?.piA?.length ||
      !claim.proof?.piB?.length ||
      !claim.proof?.piC?.length
    ) {
      return false;
    }
    if (!/^[0-9a-f]{64}$/i.test(claim.credentialHash)) {
      return false;
    }

    const vkResponse = await this.fetchImpl(claim.vkUri);
    if (!vkResponse.ok) {
      throw new Error(
        `Failed to fetch verification key from ${claim.vkUri}: HTTP ${vkResponse.status}`,
      );
    }
    const verificationKey = await vkResponse.json();

    // snarkjs is imported lazily so this SDK can be bundled for environments
    // (e.g. edge runtimes) that never call verifyZkProof.
    const snarkjs = await import("snarkjs");
    const proofForSnarkjs = {
      pi_a: claim.proof.piA,
      pi_b: claim.proof.piB,
      pi_c: claim.proof.piC,
      protocol: claim.proof.protocol,
      curve: claim.proof.curve,
    };

    return snarkjs.groth16.verify(
      verificationKey,
      claim.publicSignals,
      proofForSnarkjs,
    );
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "GET",
      headers: this.headers(),
    });
    return this.handle<T>(res);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { ...this.headers(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return this.handle<T>(res);
  }

  private headers(): Record<string, string> {
    return this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {};
  }

  private async handle<T>(res: Response): Promise<T> {
    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = await res.text().catch(() => undefined);
      }
      throw new AutonymousApiError(res.status, body);
    }
    return (await res.json()) as T;
  }
}

export * from "./types.js";
