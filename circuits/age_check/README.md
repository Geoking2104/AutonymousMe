# age_check circuit

Groth16 zk-SNARK circuit (BN128) proving `current_year - birth_year >= 18`
without revealing `birth_year`. Implements FR-ZK-01..04 from
`Technical_Specifications.docx` section 6.

## Status: verified working end-to-end

This is not a paper design -- it has been compiled and exercised for real:

- `circom age_check.circom` compiles cleanly (circom 2.2.3): 9 non-linear
  constraints, 5 linear constraints, 2 public inputs, 1 private input,
  1 public output.
- Witness generation is correct at the boundary: age 26 -> `age_ok=1`,
  age 6 -> `age_ok=0`, age exactly 18 -> `age_ok=1` (inclusive), see
  `scripts/test_witness.js`.
- A full Groth16 proof was generated (`scripts/prove.js`) and independently
  verified against the exported verification key (`scripts/verify.js`),
  using snarkjs: `Cryptographic verification: VALID`.

## Correction vs. the spec document

`Technical_Specifications.docx` section 6.1 shows:

```
age_ok <== age >= 18 ? 1 : 0;
```

This is illustrative pseudocode, not valid Circom -- comparisons must go
through a bounded comparator circuit so the constraint system stays sound.
`age_check.circom` in this directory is the corrected, actually-compilable
version, using circomlib's `GreaterEqThan(8)`.

## Trusted setup

The Powers of Tau ceremony artifacts checked into `build/ptau/` by the
`npm run setup:phase2` step in this repo are a **single-contributor test
ceremony** (`pot12_0001.ptau`), suitable for development and demos only.
Per the spec (section 6.2): "Phase 2: circuit-specific -- ceremony to be
published" for production use, a real multi-party ceremony (>= 20
independent participants, as specified) must be run before this circuit's
proofs can be trusted in production. Do not treat `build/age_check_0000.zkey`
in this repo as production-safe.

## Usage

```bash
npm install
npm run compile          # circom -> build/age_check.r1cs, build/age_check_js/
node scripts/test_witness.js   # sanity-check witness outputs (no zkey needed)

# One-time dev trusted setup (see caveat above):
npx snarkjs powersoftau new bn128 12 build/ptau/pot12_0000.ptau -v
npx snarkjs powersoftau contribute build/ptau/pot12_0000.ptau build/ptau/pot12_0001.ptau --name="dev" -v
npx snarkjs powersoftau prepare phase2 build/ptau/pot12_0001.ptau build/ptau/pot12_final.ptau -v
npx snarkjs groth16 setup build/age_check.r1cs build/ptau/pot12_final.ptau build/age_check_0000.zkey
npx snarkjs zkey export verificationkey build/age_check_0000.zkey build/verification_key.json

node scripts/prove.js 2000 2026 <credential_hash>   # -> build/proof.json, build/public.json
node scripts/verify.js                              # verifies build/proof.json
```

## How this fits the wallet + verifier flow

1. The wallet (`ui/`, `dnas/autonymous/zomes/identity_wallet`) holds the
   user's SD-JWT credential with a `birth_year` claim.
2. When an OpenID4VP request asks for an age >= 18 proof instead of the raw
   date of birth, the wallet runs `scripts/prove.js`-equivalent logic
   (snarkjs, in-browser via the wasm witness calculator) to produce a Groth16
   proof, binding it to the credential via `credential_hash`.
3. The proof is stored for audit via the `zk_prover` zome's `store_zk_proof`
   (see `dnas/autonymous/zomes/zk_prover/src/lib.rs`) and embedded in the VP
   Token by `openid4vp::build_vp_token`.
4. The verifier's REST API (`../../api`) independently re-verifies the proof
   against the published verification key using `snarkjs.groth16.verify` --
   exactly what `scripts/verify.js` does here.
