import { describe, expect, it, vi } from "vitest";
import { AutonymousApiError, AutonymousVerifierClient } from "../src/index.js";
import type { OpenId4VpRequestResponse } from "../src/types.js";

function fakeFetch(status: number, body: unknown): typeof fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
}

describe("AutonymousVerifierClient construction", () => {
  it("requires a baseUrl", () => {
    // @ts-expect-error deliberately omitting required field
    expect(() => new AutonymousVerifierClient({})).toThrow(/baseUrl/);
  });

  it("strips trailing slashes from baseUrl", async () => {
    const response: OpenId4VpRequestResponse = {
      requestUri: "openid4vp://request/abc",
      nonce: "n-1",
      requestId: "req-1",
    };
    const fetchImpl = fakeFetch(200, response);
    const client = new AutonymousVerifierClient({
      baseUrl: "https://api.autonymous.me/",
      fetchImpl,
    });

    await client.initiateRequest({
      verifierDid: "did:key:zVerifier",
      presentationDefinitionId: "age_over_18",
      responseUri: "https://verifier.example/callback",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.autonymous.me/api/v1/openid4vp/request",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("AutonymousVerifierClient.initiateRequest", () => {
  it("returns the parsed response on success", async () => {
    const response: OpenId4VpRequestResponse = {
      requestUri: "openid4vp://request/abc",
      nonce: "n-1",
      requestId: "req-1",
    };
    const client = new AutonymousVerifierClient({
      baseUrl: "https://api.autonymous.me",
      fetchImpl: fakeFetch(200, response),
    });

    const result = await client.initiateRequest({
      verifierDid: "did:key:zVerifier",
      presentationDefinitionId: "age_over_18",
      responseUri: "https://verifier.example/callback",
    });

    expect(result).toEqual(response);
  });

  it("throws AutonymousApiError on a non-2xx response", async () => {
    const client = new AutonymousVerifierClient({
      baseUrl: "https://api.autonymous.me",
      fetchImpl: fakeFetch(400, { error: "invalid_presentation_definition" }),
    });

    await expect(
      client.initiateRequest({
        verifierDid: "did:key:zVerifier",
        presentationDefinitionId: "bogus",
        responseUri: "https://verifier.example/callback",
      }),
    ).rejects.toThrow(AutonymousApiError);
  });
});

describe("AutonymousVerifierClient.verifyVpToken", () => {
  it("fails when vpToken is empty", async () => {
    const client = new AutonymousVerifierClient({
      baseUrl: "https://api.autonymous.me",
      fetchImpl: fakeFetch(200, {}),
    });

    const result = await client.verifyVpToken({ vpToken: "" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("vpToken is empty");
  });

  it("passes when vpToken is present and no zk proof is attached", async () => {
    const client = new AutonymousVerifierClient({
      baseUrl: "https://api.autonymous.me",
      fetchImpl: fakeFetch(200, {}),
    });

    const result = await client.verifyVpToken({ vpToken: "sd-jwt-vc-payload" });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.zkProofValid).toBeUndefined();
  });
});

describe("AutonymousVerifierClient.verifyZkProof", () => {
  it("rejects unsupported circuits", async () => {
    const client = new AutonymousVerifierClient({
      baseUrl: "https://api.autonymous.me",
      fetchImpl: fakeFetch(200, {}),
    });

    await expect(
      client.verifyZkProof({
        circuit: "unknown_circuit" as never,
        currentYear: 2026,
        credentialHash: "a".repeat(64),
        proof: { piA: ["1"], piB: [["1", "1"]], piC: ["1"], protocol: "groth16", curve: "bn128" },
        publicSignals: ["1"],
        vkUri: "https://verifier.example/vk.json",
      }),
    ).rejects.toThrow(/Unsupported circuit/);
  });

  it("returns false when proof points are missing", async () => {
    const client = new AutonymousVerifierClient({
      baseUrl: "https://api.autonymous.me",
      fetchImpl: fakeFetch(200, {}),
    });

    const valid = await client.verifyZkProof({
      circuit: "age_check_v1",
      currentYear: 2026,
      credentialHash: "a".repeat(64),
      proof: { piA: [], piB: [], piC: [], protocol: "groth16", curve: "bn128" },
      publicSignals: ["1"],
      vkUri: "https://verifier.example/vk.json",
    });

    expect(valid).toBe(false);
  });

  it("returns false when credentialHash is not 64 hex chars", async () => {
    const client = new AutonymousVerifierClient({
      baseUrl: "https://api.autonymous.me",
      fetchImpl: fakeFetch(200, {}),
    });

    const valid = await client.verifyZkProof({
      circuit: "age_check_v1",
      currentYear: 2026,
      credentialHash: "not-a-hash",
      proof: { piA: ["1"], piB: [["1", "1"]], piC: ["1"], protocol: "groth16", curve: "bn128" },
      publicSignals: ["1"],
      vkUri: "https://verifier.example/vk.json",
    });

    expect(valid).toBe(false);
  });
});