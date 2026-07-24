import { Router } from "express";
import type { AutonymousBackend } from "../backend.js";
import type { OpenId4VpRequestBody, VpTokenCallbackBody } from "../types.js";

export function openId4VpRouter(backend: AutonymousBackend): Router {
  const router = Router();

  // POST /api/v1/openid4vp/request
  router.post("/request", async (req, res) => {
    const body = req.body as Partial<OpenId4VpRequestBody>;
    if (!body.verifierDid || !body.presentationDefinitionId || !body.responseUri) {
      res.status(400).json({
        error: "verifierDid, presentationDefinitionId, and responseUri are required",
      });
      return;
    }

    const record = await backend.createOpenId4VpRequest({
      verifierDid: body.verifierDid,
      presentationDefinitionId: body.presentationDefinitionId,
      responseUri: body.responseUri,
      state: body.state,
      nonce: body.nonce,
    });

    res.status(201).json({
      requestUri: `openid4vp://request/${record.requestId}`,
      nonce: record.nonce,
      requestId: record.requestId,
    });
  });

  // POST /api/v1/openid4vp/callback/:requestId
  // This is the endpoint a holder's wallet POSTs its VP Token back to.
  router.post("/callback/:requestId", async (req, res) => {
    const { requestId } = req.params;
    const body = req.body as Partial<VpTokenCallbackBody>;

    if (!body.vpToken) {
      res.status(400).json({ error: "vpToken is required" });
      return;
    }

    const updated = await backend.recordVpTokenCallback(requestId, body.vpToken);
    if (!updated) {
      res.status(404).json({ error: `Unknown requestId: ${requestId}` });
      return;
    }

    res.status(200).json({ requestId: updated.requestId, status: updated.status });
  });

  // GET /api/v1/openid4vp/request/:requestId
  // Lets a verifier poll for whether the wallet has responded yet.
  router.get("/request/:requestId", async (req, res) => {
    const record = await backend.getOpenId4VpRequest(req.params.requestId);
    if (!record) {
      res.status(404).json({ error: `Unknown requestId: ${req.params.requestId}` });
      return;
    }
    res.status(200).json(record);
  });

  return router;
}