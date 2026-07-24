// Lightweight witness-level regression test for the age_check circuit.
// Verifies the compiled circuit produces the correct age_ok output for
// both an adult and a minor, without needing the full Groth16 setup.
//
// Usage: node scripts/test_witness.js   (after `npm run compile`)

const path = require("path");
const wc = require(path.join(
  __dirname, "..", "build", "age_check_js", "witness_calculator.js"
));
const fs = require("fs");

async function calc(input) {
  const wasmBuffer = fs.readFileSync(
    path.join(__dirname, "..", "build", "age_check_js", "age_check.wasm")
  );
  const witnessCalculator = await wc(wasmBuffer);
  const witness = await witnessCalculator.calculateWitness(input, true);
  // witness[0] = 1 (constant), witness[1] = age_ok public output
  return witness[1].toString();
}

async function main() {
  const adult = await calc({ birth_year: 2000, current_year: 2026, credential_hash: "12345" });
  const minor = await calc({ birth_year: 2020, current_year: 2026, credential_hash: "12345" });
  const exactly18 = await calc({ birth_year: 2008, current_year: 2026, credential_hash: "12345" });

  let failed = false;
  if (adult !== "1") { console.error(`FAIL: adult (age 26) expected age_ok=1, got ${adult}`); failed = true; }
  else console.log("PASS: adult (age 26) -> age_ok=1");

  if (minor !== "0") { console.error(`FAIL: minor (age 6) expected age_ok=0, got ${minor}`); failed = true; }
  else console.log("PASS: minor (age 6) -> age_ok=0");

  if (exactly18 !== "1") { console.error(`FAIL: exactly 18 expected age_ok=1, got ${exactly18}`); failed = true; }
  else console.log("PASS: exactly 18 -> age_ok=1 (boundary inclusive)");

  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
