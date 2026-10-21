#!/usr/bin/env node
/**
 * Copy each zome's wasm to the distinct `<zome>_coordinator.wasm` path
 * referenced by dnas/core/dna.yaml.
 *
 * hc dna pack requires each zome manifest entry (integrity + coordinator)
 * to point at its own file path, even when the bytes are identical, because
 * this workspace compiles a single combined crate per zome (the integrity
 * and coordinator code live in one wasm). See the live-conductor findings in
 * the repo README (commit 484b011).
 */
import { copyFileSync } from "node:fs";
import { join } from "node:path";

const zomes = ["identity_wallet", "openid4vp", "zk_prover"];
const targetDir = join(process.cwd(), "target", "wasm32-unknown-unknown", "release");

for (const zome of zomes) {
  const src = join(targetDir, `${zome}.wasm`);
  const dst = join(targetDir, `${zome}_coordinator.wasm`);
  copyFileSync(src, dst);
  console.log(`copied ${zome}.wasm -> ${zome}_coordinator.wasm`);
}
