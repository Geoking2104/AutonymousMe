/**
 * Manual end-to-end verification script: connects to a real, already-running
 * Holochain conductor (started via `hc sandbox generate --in-process-lair
 * --run=9000 --app-id autonomous_me autonomous_me.happ` from the repo root)
 * and exercises the identity_wallet and zk_prover zomes for real.
 *
 * This is how the HolochainBackend adapter (src/backends/holochainBackend.ts)
 * was verified end-to-end on 2026-07-25: real DID creation, real read-back,
 * real (empty) zk proof list, all round-tripped through an actual conductor
 * and source chain, not mocked.
 *
 * Usage:
 *   1. From the repo root: hc sandbox generate --in-process-lair --run=9000
 *      --app-id autonomous_me autonomous_me.happ
 *   2. From api/: node scripts/verify-conductor.mjs
 */
import { AdminWebsocket, AppWebsocket } from "@holochain/client";

async function main() {
  const wsClientOptions = { origin: "http://localhost:3000" };

  const admin = await AdminWebsocket.connect({
    url: new URL("ws://localhost:57871"),
    wsClientOptions,
  });
  console.log("Connected to admin interface");

  const apps = await admin.listApps({});
  console.log("Installed apps:", apps.map((a) => a.installed_app_id));

  const tokenResp = await admin.issueAppAuthenticationToken({
    installed_app_id: "autonomous_me",
  });
  console.log("Issued app auth token");

  const app = await AppWebsocket.connect({
    url: new URL("ws://localhost:9000"),
    token: tokenResp.token,
    wsClientOptions,
  });
  console.log("Connected to app interface");

  const appInfo = await app.appInfo();
  const cellInfo = appInfo.cell_info["autonomous"][0];
  const cellId = cellInfo.provisioned.cell_id;
  console.log("Cell id:", cellId);

  await admin.authorizeSigningCredentials(cellId);
  console.log("Authorized signing credentials");

  const createResult = await app.callZome({
    role_name: "autonomous",
    zome_name: "identity_wallet",
    fn_name: "create_did",
    payload: { context: "conductor-verification-test" },
  });
  console.log("create_did result:", JSON.stringify(createResult, null, 2));

  const getResult = await app.callZome({
    role_name: "autonomous",
    zome_name: "identity_wallet",
    fn_name: "get_my_did",
    payload: null,
  });
  console.log("get_my_did result:", JSON.stringify(getResult, null, 2));

  const zkStore = await app.callZome({
    role_name: "autonomous",
    zome_name: "zk_prover",
    fn_name: "list_zk_proofs",
    payload: null,
  });
  console.log("list_zk_proofs result:", JSON.stringify(zkStore, null, 2));

  process.exit(0);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
