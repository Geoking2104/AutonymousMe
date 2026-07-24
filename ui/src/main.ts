/**
 * Autonymous.me — hApp UI entry point
 *
 * When running inside the Holochain launcher (Tauri or Electron),
 * this module boots the AutonClient and wires it to the site's
 * existing demo UI, replacing simulated state with live zome calls.
 */

import AutonClient, {
  type CredentialWithHash,
  type AuditEntryWithHash,
  type PresentationRecordWithHash,
} from "./client.js";

// ── Boot ─────────────────────────────────────────────────────────────────

let client: AutonClient | null = null;

export async function bootHapp(): Promise<void> {
  try {
    client = await AutonClient.connect();
    console.info("[autonymous.me] Connected to Holochain conductor");

    // Ensure a DID exists for this agent
    const existingDid = await client.getMyDid();
    if (!existingDid) {
      const created = await client.createDid("default");
      console.info("[autonymous.me] DID created:", created.did);
    } else {
      console.info("[autonymous.me] Existing DID:", existingDid.did);
    }

    // Hydrate the UI
    await refreshWallet();
    await refreshAuditLog();

  } catch (err) {
    console.warn(
      "[autonymous.me] Running in demo mode (Holochain conductor not found):",
      err
    );
    // Site degrades gracefully to the simulated demo
  }
}

// ── Wallet UI ────────────────────────────────────────────────────────────

export async function refreshWallet(): Promise<void> {
  if (!client) return;
  const creds = await client.listCredentials();
  renderCredentials(creds);
}

function renderCredentials(creds: CredentialWithHash[]): void {
  const walletBody = document.getElementById("wallet-body");
  if (!walletBody) return;

  if (creds.length === 0) {
    walletBody.innerHTML = `
      <div style="text-align:center;padding:2rem;color:var(--muted);font-size:13px;">
        No credentials yet.<br>Import one from your issuer.
      </div>`;
    return;
  }

  walletBody.innerHTML = creds.map((c) => {
    const claims: string[] = JSON.parse(c.credential.available_claims || "[]");
    return `
      <div class="demo-cred">
        <div class="demo-cred-icon">🪪</div>
        <div class="demo-cred-info">
          <p class="demo-cred-name">${escHtml(c.credential.label)}</p>
          <p class="demo-cred-issuer">${escHtml(c.credential.issuer_did)}</p>
        </div>
        <span class="demo-cred-status s-verified">✓ Active</span>
      </div>`;
  }).join("");
}

// ── Audit log ────────────────────────────────────────────────────────────

export async function refreshAuditLog(): Promise<void> {
  if (!client) return;
  const entries = await client.getAuditLog();
  renderAuditLog(entries);

  const presentations = await client.listPresentations();
  renderPresentations(presentations);
}

function renderAuditLog(entries: AuditEntryWithHash[]): void {
  const container = document.getElementById("sc-dynamic");
  if (!container) return;
  if (entries.length === 0) {
    container.innerHTML = `<div class="sc-empty">No audit entries yet.</div>`;
    return;
  }

  const typeToClass: Record<string, string> = {
    did_created:          "t-did",
    vc_imported:          "t-cred",
    presentation_created: "t-vp",
    presentation_denied:  "t-vp",
    vc_revoked:           "t-cred",
  };

  container.innerHTML = entries.map((e) => `
    <div class="sc-entry ${typeToClass[e.entry.action_type] ?? "t-did"}">
      <div class="sc-hash">${escHtml(e.action_hash.toString().slice(0, 12))}...</div>
      <div class="sc-body">
        <span class="sc-type ${typeToClass[e.entry.action_type]?.replace("t-", "") ?? "did"}">
          ${escHtml(e.entry.action_type)}
        </span>
        <p class="sc-desc">${escHtml(e.entry.description)}</p>
        <p class="sc-time">${escHtml(e.entry.timestamp)}</p>
      </div>
    </div>`).join("");
}

function renderPresentations(recs: PresentationRecordWithHash[]): void {
  // Merge into the audit log display — already handled above
  // Future: dedicated presentations tab
}

// ── OpenID4VP flow ────────────────────────────────────────────────────────

/**
 * Called when the user clicks "Approve & Present VP Token" in the OID4VP demo.
 * Replaces the simulated approveAndPresent() with a live zome call.
 */
export async function liveApproveAndPresent(params: {
  raw_request: string;
  credential_id: string;
  disclosed_claims: string[];
}): Promise<{ vp_token: string; disclosed: string[]; withheld: string[] }> {
  if (!client) {
    throw new Error("Not connected to conductor — running in demo mode");
  }
  const result = await client.runOpenId4VpFlow(params);
  await refreshAuditLog();
  return result;
}

/**
 * Called when the user clicks "Deny Request".
 */
export async function liveDenyRequest(raw_request: string): Promise<void> {
  if (!client) return;
  await client.denyRequest(raw_request);
  await refreshAuditLog();
}

// ── Helpers ───────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Auto-boot when running in hApp context ────────────────────────────────
// Holochain Launcher injects window.__HC_LAUNCHER_ENV__
if (typeof window !== "undefined" && (window as any).__HC_LAUNCHER_ENV__) {
  bootHapp();
}
