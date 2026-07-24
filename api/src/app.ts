import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import type { AutonymousBackend } from "./backend.js";
import { credentialRouter } from "./routes/credential.js";
import { didRouter } from "./routes/did.js";
import { openId4VpRouter } from "./routes/openid4vp.js";

/**
 * Builds the Express app given a backend implementation. Kept as a factory
 * (rather than a module-level singleton) so tests can inject an
 * InMemoryBackend without touching a real Holochain conductor.
 */
export function createApp(backend: AutonymousBackend): Express {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/v1/openid4vp", openId4VpRouter(backend));
  app.use("/api/v1/did", didRouter(backend));
  app.use("/api/v1/credential", credentialRouter(backend));

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}