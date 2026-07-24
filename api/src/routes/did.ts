import { Router } from "express";
import type { AutonymousBackend } from "../backend.js";

export function didRouter(backend: AutonymousBackend): Router {
  const router = Router();

  // GET /api/v1/did/:did
  router.get("/:did", async (req, res) => {
    const did = decodeURIComponent(req.params.did);
    const result = await backend.resolveDid(did);
    if (!result) {
      res.status(404).json({ error: `Could not resolve DID: ${did}` });
      return;
    }
    res.status(200).json(result);
  });

  return router;
}