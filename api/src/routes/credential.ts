import { Router } from "express";
import type { AutonymousBackend } from "../backend.js";

export function credentialRouter(backend: AutonymousBackend): Router {
  const router = Router();

  // GET /api/v1/credential/:credentialId/status
  router.get("/:credentialId/status", async (req, res) => {
    const { credentialId } = req.params;
    const result = await backend.getCredentialStatus(credentialId);
    if (!result) {
      res.status(404).json({ error: `Unknown credentialId: ${credentialId}` });
      return;
    }
    res.status(200).json(result);
  });

  return router;
}