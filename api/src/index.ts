import { AdminWebsocket, AppWebsocket } from "@holochain/client";
import { createApp } from "./app.js";
import { InMemoryBackend } from "./backends/inMemoryBackend.js";
import { HolochainBackend } from "./backends/holochainBackend.js";
import type { AutonymousBackend } from "./backend.js";

const PORT = Number(process.env.PORT ?? 3000);

/**
 * Connects to a live Holochain conductor's admin + app websockets, issues an
 * app authentication token, authorizes zome-call signing credentials for the
 * installed app's cell, and returns a HolochainBackend wired up against it.
 *
 * Verified 2026-07-25 against a real `hc sandbox` conductor (holochain
 * 0.4.1): admin connect, app connect, signing authorization, and a live
 * `identity_wallet::create_did` + `get_my_did` round trip all succeeded.
 *
 * Env vars (defaults match a local `hc sandbox generate --in-process-lair
 * --run=9000 --app-id autonomous_me autonomous_me.happ` session):
 *   ADMIN_WS_URL      default ws://localhost:57871
 *   APP_WS_URL        default ws://localhost:9000
 *   INSTALLED_APP_ID  default autonomous_me
 *   ROLE_NAME         default autonomous
 *   WS_ORIGIN         default http://localhost:3000 (required by the
 *                     conductor's websocket handshake; @holochain/client
 *                     does not set an Origin header by default in Node)
 */
async function connectHolochainBackend(): Promise<HolochainBackend> {
  const adminUrl = process.env.ADMIN_WS_URL ?? "ws://localhost:57871";
  const appUrl = process.env.APP_WS_URL ?? "ws://localhost:9000";
  const installedAppId = process.env.INSTALLED_APP_ID ?? "autonomous_me";
  const roleName = process.env.ROLE_NAME ?? "autonomous";
  const wsClientOptions = {
    origin: process.env.WS_ORIGIN ?? "http://localhost:3000",
  };

  const admin = await AdminWebsocket.connect({
    url: new URL(adminUrl),
    wsClientOptions,
  });

  const { token } = await admin.issueAppAuthenticationToken({
    installed_app_id: installedAppId,
  });

  const appWs = await AppWebsocket.connect({
    url: new URL(appUrl),
    token,
    wsClientOptions,
  });

  const appInfo = await appWs.appInfo();
  const cellInfo = appInfo.cell_info[roleName]?.[0];
  if (!cellInfo || !("provisioned" in cellInfo)) {
    throw new Error(
      `No provisioned cell found for role "${roleName}" in app "${installedAppId}"`,
    );
  }
  const cellId = cellInfo.provisioned.cell_id;

  await admin.authorizeSigningCredentials(cellId);

  return new HolochainBackend(appWs, roleName);
}

async function resolveBackend(): Promise<AutonymousBackend> {
  if (process.env.AUTONYMOUS_BACKEND === "holochain") {
    return connectHolochainBackend();
  }
  return new InMemoryBackend();
}

async function main() {
  const backend = await resolveBackend();
  const backendKind =
    process.env.AUTONYMOUS_BACKEND === "holochain" ? "holochain" : "in-memory";
  const app = createApp(backend);

  app.listen(PORT, () => {
    console.log(`Autonymous.me API listening on port ${PORT} (backend: ${backendKind})`);
  });
}

main().catch((err) => {
  console.error("Failed to start Autonymous.me API:", err);
  process.exit(1);
});
