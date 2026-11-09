/**
 * End-to-end verification + app installation against a live Holochain 0.7.1
 * conductor (hc sandbox call was removed in 0.7; everything goes through
 * the admin/app websockets with @holochain/client 0.21).
 *
 * Precondition: conductor running with admin ws on 9100 (see run07.sh).
 *
 * From api/: node scripts/verify-conductor-07.mjs
 *   ADMIN_WS_URL (default ws://localhost:9100)
 *   APP_WS_URL   (default ws://localhost:9000)
 *   HAPP_PATH    (default ../autonymous-me.happ)
 */
import { AdminWebsocket, AppWebsocket } from "@holochain/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ADMIN_URL = process.env.ADMIN_WS_URL ?? "ws://localhost:9100";
const APP_PORT_URL = process.env.APP_WS_URL ?? "ws://localhost:9000";
const INSTALLED_APP_ID = "autonomous_me";
const ROLE = "autonomous";

async function main() {
  const wsClientOptions = { origin: "http://localhost:3000" };
  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions });
  console.log("[1] admin connected:", ADMIN_URL);

  // Attach an app interface on port 9000 (idempotent: AddrInUse means a
  // previous run already attached it)
  try {
    const attached = await admin.attachAppInterface({ port: 9000, allowed_origins: "*" });
    console.log("[2] app interface attached:", JSON.stringify(attached));
  } catch (err) {
    if (String(err).includes("AddrInUse")) {
      console.log("[2] app interface already attached on 9000");
    } else {
      throw err;
    }
  }

  // Install (or reuse) the hApp from local bundle bytes
  const happPath = resolve(process.env.HAPP_PATH ?? "../autonymous-me.happ");
  const happBytes = readFileSync(happPath);
  let installed = false;
  const apps = await admin.listApps({});
  const already = apps.some((a) => a.installed_app_id === INSTALLED_APP_ID);
  if (!already) {
    await admin.installApp({
      installed_app_id: INSTALLED_APP_ID,
      source: { type: "bytes", value: happBytes },
      memproofs: {},
    });
    installed = true;
  }
  console.log(`[3] hApp ${installed ? "installed" : "already present"} (${happPath})`);

  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: INSTALLED_APP_ID });
  const app = await AppWebsocket.connect({ url: new URL(APP_PORT_URL), token, wsClientOptions });
  console.log("[4] app websocket connected:", APP_PORT_URL);

  const info0 = await app.appInfo();
  if (info0.status.type === "disabled") {
    await admin.enableApp({ installed_app_id: INSTALLED_APP_ID });
    console.log("[5a] app enabled (was disabled/never_started)");
  }

  const info = await app.appInfo();
  console.log("[5] appInfo status:", JSON.stringify(info.status));
  if (info.status.type !== "enabled") throw new Error("app not enabled: " + JSON.stringify(info.status));

  const cellEntry = info.cell_info[ROLE][0];
  if (cellEntry.type !== "provisioned") throw new Error("no provisioned cell");
  const cellId = cellEntry.value.cell_id;
  console.log("[6] cell id ok (0.6+/0.7 enum shape)");

  await admin.authorizeSigningCredentials(cellId);
  console.log("[7] signing credentials authorized");

  const created = await app.callZome({
    role_name: ROLE, zome_name: "identity_wallet", fn_name: "create_did",
    payload: { context: "migration-0.7-verification" },
  });
  console.log("[8] create_did:", JSON.stringify(created).slice(0, 140));

  const mine = await app.callZome({
    role_name: ROLE, zome_name: "identity_wallet", fn_name: "get_my_did", payload: null,
  });
  console.log("[9] get_my_did:", JSON.stringify(mine).slice(0, 140));

  const audit = await app.callZome({
    role_name: ROLE, zome_name: "identity_wallet", fn_name: "get_audit_log", payload: null,
  });
  console.log("[10] get_audit_log entries:", audit.length);

  const pres = await app.callZome({
    role_name: ROLE, zome_name: "openid4vp", fn_name: "record_presentation",
    payload: {
      nonce: "verify-07-nonce-1", verifier: "did:hc:verifier-test",
      disclosed_claims: ["age_gte_18"], withheld_claims: ["birth_date"],
      vp_token: "hdr.pay.sig~disc1~kb", outcome: "approved",
    },
  });
  console.log("[11] record_presentation ok:", !!pres);

  const list = await app.callZome({
    role_name: ROLE, zome_name: "openid4vp", fn_name: "list_presentations", payload: null,
  });
  const found = list.some((p) => p.record.nonce === "verify-07-nonce-1");
  console.log("[12] list_presentations:", list.length, "nonce found:", found);
  if (!found) throw new Error("presentation not listed");

  const zk = await app.callZome({
    role_name: ROLE, zome_name: "zk_prover", fn_name: "list_zk_proofs", payload: null,
  });
  console.log("[13] list_zk_proofs:", zk.length);

  console.log("\nALL CHECKS OK — Holochain 0.7.1 end-to-end verification PASSED");
  process.exit(0);
}

main().catch((err) => { console.error("FAILED:", err); process.exit(1); });
