import { Router } from "express";
import type { AutonymousBackend } from "../backend.js";
import type { RegisterIssuerBody } from "../types.js";

export function issuerRouter(backend: AutonymousBackend): Router {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const body = req.body as Partial<RegisterIssuerBody>;
      if (
        typeof body.displayName !== "string" ||
        !body.displayName.trim() ||
        !Array.isArray(body.credentialTypes) ||
        body.credentialTypes.length === 0 ||
        body.credentialTypes.some(
          (value) => typeof value !== "string" || !value.trim(),
        ) ||
        typeof body.verificationMethod !== "string" ||
        !body.verificationMethod.trim()
      ) {
        res.status(400).json({ error: "Invalid issuer registration" });
        return;
      }

      const issuer = await backend.registerIssuer(body as RegisterIssuerBody);
      res.status(201).json(issuer);
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (_req, res, next) => {
    try {
      res.status(200).json(await backend.listIssuers());
    } catch (error) {
      next(error);
    }
  });

  router.get("/:issuerDid", async (req, res, next) => {
    try {
      const issuer = await backend.getIssuer(req.params.issuerDid);
      if (!issuer) {
        res.status(404).json({ error: "Issuer not found" });
        return;
      }
      res.status(200).json(issuer);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
