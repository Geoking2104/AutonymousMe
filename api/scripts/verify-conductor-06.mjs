/**
 * End-to-end verification against a live Holochain 0.6.1 conductor.
 *
 * Setup (from WSL/Ubuntu, binaries in ~/.local/bin):
 *   holochain --piped -c <sandbox>/conductor-config.yaml   (admin port 9100)
 *   hc sandbox call --running 9100 install-app --app-id autonomous_me /abs/path/autonymous-me.happ
 *   hc sandbox call --running 9100 enable-app autonomous_me
 *   hc sandbox call --running 9100 add-app-ws 9000
 *
 * Then: node scripts/verify-conductor-06.mjs   (from api/, Windows or WSL)
 */
import { AdminWebsocket, AppWebsocket } from "@holochain/client";

const ADMIN_URL = process.env.ADMIN_WS_URL ?? "ws://localhost:9100";
const APP_URL = process.env.APP_WS_URL ?? "ws://localhost:9000";
const INSTALLED_APP_ID = "autonomous_me";
const ROLE = "autonomous";

async function main() {
  const wsClientOptions = { origin: "http://localhost:3000" };

  const admin = await AdminWebsocket.connect({ url: new URL(ADMIN_URL), wsClientOptions });
  console.log("[1] admin connected:", ADMIN_URL);

  const apps = await admin.listApps({});
  console.log("[2] installed apps:", apps.map((a) => a.installed_app_id));

  const { token } = await admin.issueAppAuthenticationToken({ installed_app_id: INSTALLED_APP_ID });
  console.log("[3] app auth token issued");

  const app = await AppWebsocket.connect({ url: new URL(APP_URL), token, wsClientOptions });
  console.log("[4] app websocket connected:", APP_URL);

  const info = await app.appInfo();
  console.log("[5] appInfo status:", JSON.stringify(info.status));

  const cellEntry = info.cell_info[ROLE][0];
  if (cellEntry.type !== "provisioned") throw new Error("no provisioned cell");
  const cellId = cellEntry.value.cell_id;
  console.log("[6] cell id (0.6 enum shape ok):", cellId.slice(0, 2).map((h) => h.slice(0, 8) + "..."));

  await admin.authorizeSigningCredentials(cellId);
  console.log("[7] signing credentials authorized");

  const createResult = await app.callZome({
    role_name: ROLE,
    zome_name: "identity_wallet",
    fn_name: "create_did",
    payload: { context: "migration-0.6-verification" },
  });
  console.log("[8] create_did:", JSON.stringify(createResult));

  const got = await app.callZome({
    role_name: ROLE,
    zome_name: "identity_wallet",
    fn_name: "get_my_did",
    payload: null,
  });
  console.log("[9] get_my_did:", JSON.stringify(got));

  const audit = await app.callZome({
    role_name: ROLE,
    zome_name: "identity_wallet",
    fn_name: "get_audit_log",
    payload: null,
  });
  console.log("[10] get_audit_log entries:", audit.length, JSON.stringify(audit.slice(0, 2)));

  const pres = await app.callZome({
    role_name: ROLE,
    zome_name: "openid4vp",
    fn_name: "record_presentation",
    payload: {
      nonce: "verify-nonce-1",
      verifier: "did:hc:verifier-test",
      disclosed_claims: ["age_gte_18"],
      withheld_claims: ["birth_date"],
      vp_token: "eyJhbGciOiJFZERTQSJ9.payload-test.sig~disc1~kb-jwt",
      outcome: "approved",
    },
  });
  console.log("[11] record_presentation action:", JSON.stringify(pres));

  const list = await app.callZome({
    role_name: ROLE,
    zome_name: "openid4vp",
    fn_name: "list_presentations",
    payload: null,
  });
  console.log("[12] list_presentations:", list.length, JSON.stringify(list.slice(0, 1)));

  const zk = await app.callZome({
    role_name: ROLE,
    zome_name: "zk_prover",
    fn_name: "list_zk_proofs",
    payload: null,
  });
  console.log("[13] list_zk_proofs:", zk.length);

  console.log("\nALL ZOME CALLS OK — Holochain 0.6.1 end-to-end verification PASSED");
  process.exit(0);
}

main().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
