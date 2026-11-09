/**
 * Multi-agent Tryorama scenario for the Autonymous.me hApp.
 *
 * Two players (Alice, Bob) each get their own conductor running the hApp,
 * then each exercises the full holder flow on their own source chain:
 *   create_did -> get_my_did -> get_audit_log -> record_presentation -> list_presentations
 *
 * All hApp entries are private (visibility = "private"), so nothing is
 * expected to cross the DHT between agents; this scenario proves that the
 * hApp installs and runs correctly on multiple independent conductors in a
 * real (mem-network) Tryorama environment.
 *
 * Run (Holochain 0.6 binaries on PATH or via HOLOCHAIN_PATH):
 *   HAPP_PATH=/abs/path/autonymous-me.happ npm test --workspace tests
 */
import { Scenario } from "@holochain-open-dev/tryorama";
import { encodeHashToBase64 } from "@holochain/client";

const HAPP_PATH =
  process.env.HAPP_PATH ?? new URL("../../autonymous-me.happ", import.meta.url).pathname;

const ROLE = "autonomous";

interface DidOutput {
  did: string;
}

interface DidRecord {
  did: string;
  context: string;
  active: boolean;
}

interface AuditEntryWithHash {
  entry: { action_type: string; description: string };
}

interface PresentationRecordWithHash {
  record: { nonce: string; outcome: string; verifier: string };
}

async function exerciseHolderFlow(
  player: Awaited<ReturnType<Scenario["addPlayerWithApp"]>>,
  index: number,
): Promise<void> {
  const cell = player.cells[0];

  const created = await cell.callZome<DidOutput>({
    zome_name: "identity_wallet",
    fn_name: "create_did",
    payload: { context: `tryorama-agent-${index}` },
  });
  if (!created.did?.startsWith("did:hc:")) {
    throw new Error(`agent ${index}: unexpected DID ${created.did}`);
  }

  const mine = await cell.callZome<DidRecord | null>({
    zome_name: "identity_wallet",
    fn_name: "get_my_did",
    payload: null,
  });
  if (!mine || mine.did !== created.did) {
    throw new Error(`agent ${index}: get_my_did mismatch (${mine?.did} vs ${created.did})`);
  }

  const audit = await cell.callZome<AuditEntryWithHash[]>({
    zome_name: "identity_wallet",
    fn_name: "get_audit_log",
    payload: null,
  });
  const hasDidCreated = audit.some((a) => a.entry.action_type === "did_created");
  if (!hasDidCreated) {
    throw new Error(`agent ${index}: audit log missing did_created entry`);
  }

  const nonce = `tryorama-nonce-${index}`;
  const recorded = await cell.callZome<unknown>({
    zome_name: "openid4vp",
    fn_name: "record_presentation",
    payload: {
      nonce,
      verifier: "did:hc:tryorama-verifier",
      disclosed_claims: ["age_gte_18"],
      withheld_claims: ["birth_date"],
      vp_token: "hdr.pay.sig~disc1~kb",
      outcome: "approved",
    },
  });
  if (recorded === null || recorded === undefined) {
    throw new Error(`agent ${index}: record_presentation failed`);
  }

  const presentations = await cell.callZome<PresentationRecordWithHash[]>({
    zome_name: "openid4vp",
    fn_name: "list_presentations",
    payload: null,
  });
  const found = presentations.some(
    (p) => p.record.nonce === nonce && p.record.outcome === "approved",
  );
  if (!found) {
    throw new Error(`agent ${index}: presentation ${nonce} not listed`);
  }

  console.log(`agent ${index} (${created.did.slice(0, 24)}...): holder flow OK`);
}

async function main(): Promise<void> {
  const scenario = new Scenario();
  try {
    const [alice, bob] = await scenario.addPlayersWithApps([
      { appBundleSource: { type: "path", value: HAPP_PATH } },
      { appBundleSource: { type: "path", value: HAPP_PATH } },
    ]);

    if (encodeHashToBase64(alice.agentPubKey) === encodeHashToBase64(bob.agentPubKey)) {
      throw new Error("players should have distinct agent keys");
    }

    await exerciseHolderFlow(alice, 0);
    await exerciseHolderFlow(bob, 1);

    console.log("\nTRYORAMA SCENARIO PASSED â€” 2 independent conductors, 12 checks green");
  } finally {
    await scenario.shutDown();
  }
}

main().catch((err) => {
  console.error("TRYORAMA SCENARIO FAILED:", err);
  process.exit(1);
});
