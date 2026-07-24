import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { InMemoryBackend } from "../src/backends/inMemoryBackend.js";

describe("Autonymous.me REST API", () => {
  let backend: InMemoryBackend;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    backend = new InMemoryBackend();
    app = createApp(backend);
  });

  it("GET /health returns ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  describe("POST /api/v1/openid4vp/request", () => {
    it("rejects missing fields", async () => {
      const res = await request(app).post("/api/v1/openid4vp/request").send({});
      expect(res.status).toBe(400);
    });

    it("creates a request and returns a requestUri", async () => {
      const res = await request(app).post("/api/v1/openid4vp/request").send({
        verifierDid: "did:key:zVerifier",
        presentationDefinitionId: "age_over_18",
        responseUri: "https://verifier.example/callback",
      });
      expect(res.status).toBe(201);
      expect(res.body.requestUri).toMatch(/^openid4vp:\/\/request\//);
      expect(res.body.requestId).toBeTruthy();
      expect(res.body.nonce).toBeTruthy();
    });
  });

  describe("POST /api/v1/openid4vp/callback/:requestId", () => {
    it("404s for an unknown requestId", async () => {
      const res = await request(app)
        .post("/api/v1/openid4vp/callback/does-not-exist")
        .send({ vpToken: "abc" });
      expect(res.status).toBe(404);
    });

    it("400s when vpToken is missing", async () => {
      const created = await request(app).post("/api/v1/openid4vp/request").send({
        verifierDid: "did:key:zVerifier",
        presentationDefinitionId: "age_over_18",
        responseUri: "https://verifier.example/callback",
      });
      const res = await request(app)
        .post(`/api/v1/openid4vp/callback/${created.body.requestId}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it("records the VP token and marks the request fulfilled", async () => {
      const created = await request(app).post("/api/v1/openid4vp/request").send({
        verifierDid: "did:key:zVerifier",
        presentationDefinitionId: "age_over_18",
        responseUri: "https://verifier.example/callback",
      });
      const requestId = created.body.requestId;

      const callback = await request(app)
        .post(`/api/v1/openid4vp/callback/${requestId}`)
        .send({ vpToken: "sd-jwt-vc-payload" });
      expect(callback.status).toBe(200);
      expect(callback.body.status).toBe("fulfilled");

      const fetched = await request(app).get(`/api/v1/openid4vp/request/${requestId}`);
      expect(fetched.status).toBe(200);
      expect(fetched.body.vpToken).toBe("sd-jwt-vc-payload");
      expect(fetched.body.status).toBe("fulfilled");
    });
  });

  describe("GET /api/v1/did/:did", () => {
    it("resolves a well-formed DID", async () => {
      const res = await request(app).get(
        `/api/v1/did/${encodeURIComponent("did:key:zAliceExample")}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.did).toBe("did:key:zAliceExample");
      expect(res.body.didDocument).toBeDefined();
    });

    it("404s for a malformed DID", async () => {
      const res = await request(app).get(`/api/v1/did/${encodeURIComponent("not-a-did")}`);
      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/v1/credential/:credentialId/status", () => {
    it("404s for an unknown credential", async () => {
      const res = await request(app).get("/api/v1/credential/unknown-id/status");
      expect(res.status).toBe(404);
    });

    it("reports active for a seeded, non-revoked credential", async () => {
      backend.seedCredential("cred-1", false);
      const res = await request(app).get("/api/v1/credential/cred-1/status");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("active");
    });

    it("reports revoked for a seeded, revoked credential", async () => {
      backend.seedCredential("cred-2", true);
      const res = await request(app).get("/api/v1/credential/cred-2/status");
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("revoked");
      expect(res.body.revokedAt).toBeTruthy();
    });
  });

  it("returns 404 JSON for unknown routes", async () => {
    const res = await request(app).get("/nope");
    expect(res.status).toBe(404);
    expect(res.body.error).toBeTruthy();
  });
});