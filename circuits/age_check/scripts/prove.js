// Generate a Groth16 proof for the age_check circuit.
//
// Usage:
//   node scripts/prove.js <birth_year> <current_year> <credential_hash>
//
// Requires build/age_check_js/age_check.wasm and build/age_check_0000.zkey
// to already exist (run `npm run compile` then the setup steps in README.md
// first).

const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

async function main() {
  const [, , birthYearArg, currentYearArg, credentialHashArg] = process.argv;

  const input = {
    birth_year: birthYearArg ? parseInt(birthYearArg, 10) : 2000,
    current_year: currentYearArg ? parseInt(currentYearArg, 10) : 2026,
    credential_hash: credentialHashArg || "12345",
  };

  const wasmPath = path.join(__dirname, "..", "build", "age_check_js", "age_check.wasm");
  const zkeyPath = path.join(__dirname, "..", "build", "age_check_0000.zkey");

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath
  );

  const outDir = path.join(__dirname, "..", "build");
  fs.writeFileSync(path.join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
  fs.writeFileSync(path.join(outDir, "public.json"), JSON.stringify(publicSignals, null, 2));

  console.log("Proof written to build/proof.json");
  console.log("Public signals (age_ok, current_year, credential_hash):", publicSignals);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
