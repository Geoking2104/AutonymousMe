//! # zk_prover zome
//!
//! Stores and audits zero-knowledge proofs generated for selective-disclosure
//! age assertions (FR-ZK-01 .. FR-ZK-04).
//!
//! Proving/verification boundary (see Technical_Specifications.docx section 6):
//! - The Groth16 proof itself is generated OFF-zome, in JS/WASM via snarkjs,
//!   against the `circuits/age_check` Circom circuit. Running a full Groth16
//!   prover inside a Holochain WASM guest is not implemented in this pass --
//!   it would require porting an arkworks/bellman-class proving backend to
//!   wasm32-unknown-unknown, which is a separate, larger effort (tracked as
//!   future work below).
//! - This zome is the source-of-truth for WHAT was proved and WHEN: it stores
//!   the proof blob, public inputs, and circuit id as a private Source Chain
//!   entry (tamper-evident, agent-signed), and performs structural validation
//!   (shape of the proof, sane public inputs) on every write.
//! - Cryptographic verification of the Groth16 proof against the published
//!   verification key is performed independently by the verifier, off-chain,
//!   using snarkjs (see `sdk/` and `api/`). This matches the protocol: a
//!   verifier must not have to trust the holder's own chain to accept a proof.
//!
//! Future work (Phase 5+): native Groth16 verification inside this zome via
//! a wasm32-compatible verifier (e.g. a trimmed arkworks build), so a peer
//! can also self-check a proof against the DHT-published verification key
//! without leaving Holochain.

use hdk::prelude::*;
use serde::{Deserialize, Serialize};

// --------------------------------------------------------------- ENTRY TYPES

/// A stored zero-knowledge proof, generated off-zome by snarkjs against the
/// `age_check` Circom circuit, and recorded here for audit purposes.
#[hdk_entry_helper]
#[derive(Clone)]
pub struct ZkProofRecord {
    /// Links this proof to a `StoredCredential.id` in the identity_wallet zome.
    pub credential_id: String,
    /// Proving system identifier, e.g. "groth16".
    pub proof_type: String,
    /// Circuit identifier + version, e.g. "age_check_v1".
    pub circuit: String,
    /// Public input: the year used for the age >= 18 comparison.
    pub current_year: u32,
    /// Public input: sha256 hex digest binding the proof to a specific SD-JWT,
    /// preventing the proof from being replayed against another credential.
    pub credential_hash: String,
    /// Groth16 proof point A (hex-encoded, BN128 G1).
    pub pi_a: String,
    /// Groth16 proof point B (hex-encoded, BN128 G2).
    pub pi_b: String,
    /// Groth16 proof point C (hex-encoded, BN128 G1).
    pub pi_c: String,
    /// DID (or DHT address) of the published verification key for this circuit.
    pub vk_uri: String,
    pub generated_at: String,
}

#[hdk_entry_types]
#[unit_enum(UnitEntryTypes)]
pub enum EntryTypes {
    #[entry_type(required_validations = 5, visibility = "private")]
    ZkProofRecord(ZkProofRecord),
}

#[hdk_link_types]
pub enum LinkTypes {
    CredentialToProof,
}

// ----------------------------------------------------------------- I/O TYPES

#[derive(Serialize, Deserialize, Debug)]
pub struct StoreZkProofInput {
    pub credential_id: String,
    pub proof_type: String,
    pub circuit: String,
    pub current_year: u32,
    pub credential_hash: String,
    pub pi_a: String,
    pub pi_b: String,
    pub pi_c: String,
    pub vk_uri: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct StoreZkProofOutput {
    pub action_hash: ActionHash,
    pub proof: ZkProofRecord,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ZkProofWithHash {
    pub action_hash: ActionHash,
    pub proof: ZkProofRecord,
}

/// Structural check performed locally before a proof is embedded in a VP Token.
/// This is NOT cryptographic verification -- see the module doc comment.
#[derive(Serialize, Deserialize, Debug)]
pub struct CheckProofShapeInput {
    pub credential_id: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CheckProofShapeOutput {
    pub well_formed: bool,
    pub reason: Option<String>,
}

// ------------------------------------------------------------- ZOME FUNCTIONS

/// Record a zk-SNARK proof generated off-zome by the wallet UI (via snarkjs)
/// after the user has authorised disclosure of an age >= 18 assertion.
///
/// Implements FR-ZK-03: "The system SHALL embed the zk proof in the VP Token
/// as an additional claim (proof_type: groth16)" -- this call is the
/// audit/storage half of that requirement; embedding happens in the
/// openid4vp zome's `build_vp_token`.
#[hdk_extern]
pub fn store_zk_proof(input: StoreZkProofInput) -> ExternResult<StoreZkProofOutput> {
    if input.pi_a.is_empty() || input.pi_b.is_empty() || input.pi_c.is_empty() {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Proof points pi_a/pi_b/pi_c are required".into()
        )));
    }
    if input.credential_hash.len() != 64 {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "credential_hash must be a 32-byte sha256 hex digest".into()
        )));
    }

    let proof = ZkProofRecord {
        credential_id: input.credential_id,
        proof_type: input.proof_type,
        circuit: input.circuit,
        current_year: input.current_year,
        credential_hash: input.credential_hash,
        pi_a: input.pi_a,
        pi_b: input.pi_b,
        pi_c: input.pi_c,
        vk_uri: input.vk_uri,
        generated_at: now_ts()?,
    };

    let action_hash = create_entry(EntryTypes::ZkProofRecord(proof.clone()))?;

    Ok(StoreZkProofOutput { action_hash, proof })
}

/// Retrieve the most recent stored proof for a given credential.
#[hdk_extern]
pub fn get_zk_proof(credential_id: String) -> ExternResult<Option<ZkProofWithHash>> {
    let records = query(
        QueryFilter::new()
            .include_entries(true)
            .action_type(ActionType::Create),
    )?;
    for record in records.iter().rev() {
        if let Ok(Some(proof)) = record.entry().to_app_option::<ZkProofRecord>() {
            if proof.credential_id == credential_id {
                return Ok(Some(ZkProofWithHash {
                    action_hash: record.action_hashed().hash.clone(),
                    proof,
                }));
            }
        }
    }
    Ok(None)
}

/// List every zk proof this agent has generated, most recent first.
#[hdk_extern]
pub fn list_zk_proofs(_: ()) -> ExternResult<Vec<ZkProofWithHash>> {
    let records = query(
        QueryFilter::new()
            .include_entries(true)
            .action_type(ActionType::Create),
    )?;
    Ok(records
        .iter()
        .rev()
        .filter_map(|r| {
            r.entry()
                .to_app_option::<ZkProofRecord>()
                .ok()?
                .map(|proof| ZkProofWithHash {
                    action_hash: r.action_hashed().hash.clone(),
                    proof,
                })
        })
        .collect())
}

/// Structural sanity check on a stored proof: correct circuit id, current_year
/// within a plausible range, proof points present. Does not verify the
/// cryptographic Groth16 pairing -- that happens on the verifier side via
/// snarkjs against the published verification key (see api/src/verify.ts).
#[hdk_extern]
pub fn check_proof_shape(input: CheckProofShapeInput) -> ExternResult<CheckProofShapeOutput> {
    let found = get_zk_proof(input.credential_id)?;
    let Some(found) = found else {
        return Ok(CheckProofShapeOutput {
            well_formed: false,
            reason: Some("No proof found for this credential".into()),
        });
    };
    let p = found.proof;

    if p.circuit != "age_check_v1" {
        return Ok(CheckProofShapeOutput {
            well_formed: false,
            reason: Some(format!("Unrecognised circuit id: {}", p.circuit)),
        });
    }
    if p.current_year < 2020 || p.current_year > 2100 {
        return Ok(CheckProofShapeOutput {
            well_formed: false,
            reason: Some("current_year out of plausible range".into()),
        });
    }
    if p.pi_a.is_empty() || p.pi_b.is_empty() || p.pi_c.is_empty() {
        return Ok(CheckProofShapeOutput {
            well_formed: false,
            reason: Some("Missing Groth16 proof point(s)".into()),
        });
    }

    Ok(CheckProofShapeOutput {
        well_formed: true,
        reason: None,
    })
}

// --------------------------------------------------------------- VALIDATION

#[hdk_extern]
pub fn validate(op: Op) -> ExternResult<ValidateCallbackResult> {
    let Op::StoreEntry(store_entry) = op else {
        return Ok(ValidateCallbackResult::Valid);
    };

    if let Entry::App(bytes) = &store_entry.entry {
        let sb = SerializedBytes::from(bytes.clone());
        if let Ok(proof) = ZkProofRecord::try_from(sb) {
            if proof.credential_id.is_empty() {
                return Ok(ValidateCallbackResult::Invalid(
                    "credential_id is required".into(),
                ));
            }
            if proof.proof_type != "groth16" {
                return Ok(ValidateCallbackResult::Invalid(
                    "Only groth16 proofs are supported in this version".into(),
                ));
            }
            if proof.credential_hash.len() != 64
                || !proof.credential_hash.chars().all(|c| c.is_ascii_hexdigit())
            {
                return Ok(ValidateCallbackResult::Invalid(
                    "credential_hash must be a 64-char hex sha256 digest".into(),
                ));
            }
        }
    }

    Ok(ValidateCallbackResult::Valid)
}

// ------------------------------------------------------------------ HELPERS

fn now_ts() -> ExternResult<String> {
    let s = sys_time()?.as_seconds_and_nanos().0;
    Ok(format!(
        "{:04}-{:02}-{:02} {:02}:{:02}:{:02} UTC",
        1970 + s / 31_557_600,
        1 + (s % 31_557_600) / 2_629_800,
        1 + (s % 2_629_800) / 86_400,
        (s / 3600) % 24,
        (s / 60) % 60,
        s % 60
    ))
}
