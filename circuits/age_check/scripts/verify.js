// Verify a Groth16 proof for the age_check circuit against the published
// verification key. This is the exact check a verifier's REST API (see
// ../../api) performs before accepting an age >= 18 assertion.
//
// Usage:
//   node scripts/verify.js

const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

async function main() {
  const buildDir = path.join(__dirname, "..", "build");
  const vkey = JSON.parse(fs.readFileSync(path.join(buildDir, "verification_key.json")));
  const proof = JSON.parse(fs.readFileSync(path.join(buildDir, "proof.json")));
  const publicSignals = JSON.parse(fs.readFileSync(path.join(buildDir, "public.json")));

  const ok = await snarkjs.groth16.verify(vkey, publicSignals, proof);

  // publicSignals order matches the circuit's public output + public inputs:
  // [age_ok, current_year, credential_hash]
  const [ageOk, currentYear, credentialHash] = publicSignals;

  console.log("Cryptographic verification:", ok ? "VALID" : "INVALID");
  console.log("age_ok public output:", ageOk, ageOk === "1" ? "(>= 18)" : "(< 18)");
  console.log("current_year:", currentYear);
  console.log("credential_hash:", credentialHash);

  if (!ok || ageOk !== "1") {
    console.error("Proof does not establish age >= 18 -- reject.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
