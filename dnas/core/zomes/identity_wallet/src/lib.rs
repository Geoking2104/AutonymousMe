//! # identity_wallet zome
//!
//! Manages the user's self-sovereign identity:
//! - DID lifecycle (create, get active, deactivate)
//! - SD-JWT Verifiable Credential wallet (private Source Chain entries)
//! - Source Chain audit log (tamper-proof, append-only)
//! - Credential revocation
//!
//! All entries use `visibility = "private"` ? nothing is shared to the DHT.
//! The Holochain Source Chain provides immutable local ordering and peer validation.

use hdk::prelude::*;
use serde::{Deserialize, Serialize};

// ??????????????????????????????? ENTRY TYPES ???????????????????????????????

/// A Decentralized Identifier (DID) record.
/// The DID string is derived from the Holochain agent public key:
///   `did:hc:<AgentPubKey_b64>`
#[hdk_entry_helper]
#[derive(Clone)]
pub struct DidRecord {
    pub did: String,
    /// Human label for this DID's context, e.g. "banking", "voting", "default"
    pub context: String,
    pub created_at: String,
    pub active: bool,
}

/// A Verifiable Credential stored locally on the agent's Source Chain.
/// `token` is the raw SD-JWT: `<header>.<payload>.<sig>~<disc1>~<disc2>~`
#[hdk_entry_helper]
#[derive(Clone)]
pub struct StoredCredential {
    /// Hex-encoded random 128-bit ID
    pub id: String,
    /// W3C credential type, e.g. "IdentityCredential", "AgeCredential"
    pub credential_type: String,
    /// Human-readable label for the wallet UI
    pub label: String,
    /// DID of the issuer
    pub issuer_did: String,
    /// Full SD-JWT token: `header.payload.sig~disc1~disc2~`
    pub token: String,
    /// JSON-encoded `Vec<String>` of available claim names
    pub available_claims: String,
    /// ISO 8601 issuance date
    pub issued_at: String,
    /// Optional ISO 8601 expiry
    pub expires_at: Option<String>,
    pub revoked: bool,
}

/// An audit event appended to the Source Chain for every sensitive action.
/// Contains no personal data ? only action type, description, and metadata IDs.
#[hdk_entry_helper]
#[derive(Clone)]
pub struct AuditEntry {
    /// One of: "did_created", "vc_imported", "presentation_created",
    ///         "presentation_denied", "vc_revoked"
    pub action_type: String,
    pub description: String,
    /// Minimal JSON metadata: IDs and types only, never raw personal data
    pub metadata: String,
    pub timestamp: String,
}

#[hdk_entry_types]
#[unit_enum(UnitEntryTypes)]
pub enum EntryTypes {
    #[entry_type(required_validations = 5, visibility = "private")]
    DidRecord(DidRecord),
    #[entry_type(required_validations = 5, visibility = "private")]
    StoredCredential(StoredCredential),
    #[entry_type(required_validations = 5, visibility = "private")]
    AuditEntry(AuditEntry),
}

#[hdk_link_types]
pub enum LinkTypes {
    AgentToCredential,
}

// ??????????????????????????????? I/O TYPES ?????????????????????????????????

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateDidInput {
    pub context: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CreateDidOutput {
    pub did: String,
    pub action_hash: ActionHash,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ImportCredentialInput {
    pub credential_type: String,
    pub label: String,
    pub issuer_did: String,
    pub token: String,
    pub available_claims: Vec<String>,
    pub issued_at: String,
    pub expires_at: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ImportCredentialOutput {
    pub id: String,
    pub action_hash: ActionHash,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct CredentialWithHash {
    pub action_hash: ActionHash,
    pub credential: StoredCredential,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AuditEntryWithHash {
    pub action_hash: ActionHash,
    pub entry: AuditEntry,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RevokeCredentialInput {
    pub credential_id: String,
}

// ??????????????????????????????? ZOME FUNCTIONS ????????????????????????????

/// Create a new DID for the current agent.
/// The DID is derived from the agent's public key.
#[hdk_extern]
pub fn create_did(input: CreateDidInput) -> ExternResult<CreateDidOutput> {
    let agent_pub_key = agent_info()?.agent_latest_pubkey;
    let did = format!("did:hc:{}", agent_pub_key);

    let record = DidRecord {
        did: did.clone(),
        context: input.context.clone(),
        created_at: now_ts()?,
        active: true,
    };
    let action_hash = create_entry(EntryTypes::DidRecord(record))?;

    append_audit(
        "did_created",
        &format!("DID created for context '{}'", input.context),
        &format!(r#"{{"context":"{}"}}"#, input.context),
    )?;

    Ok(CreateDidOutput { did, action_hash })
}

/// Return the most recent active DID for this agent.
#[hdk_extern]
pub fn get_my_did(_: ()) -> ExternResult<Option<DidRecord>> {
    let records = query(
        QueryFilter::new()
            .include_entries(true)
            .action_type(ActionType::Create),
    )?;
    for record in records.iter().rev() {
        if let Ok(Some(did)) = record.entry().to_app_option::<DidRecord>() {
            if did.active {
                return Ok(Some(did));
            }
        }
    }
    Ok(None)
}

/// Import a Verifiable Credential (SD-JWT) into the local wallet.
/// The credential is stored as a private entry ? it never leaves this device.
#[hdk_extern]
pub fn import_credential(input: ImportCredentialInput) -> ExternResult<ImportCredentialOutput> {
    let id = gen_id()?;
    let claims_json = format!(
        "[{}]",
        input
            .available_claims
            .iter()
            .map(|c| format!(r#""{}""#, c))
            .collect::<Vec<_>>()
            .join(",")
    );

    let cred = StoredCredential {
        id: id.clone(),
        credential_type: input.credential_type.clone(),
        label: input.label.clone(),
        issuer_did: input.issuer_did.clone(),
        token: input.token,
        available_claims: claims_json,
        issued_at: input.issued_at,
        expires_at: input.expires_at,
        revoked: false,
    };
    let action_hash = create_entry(EntryTypes::StoredCredential(cred))?;

    append_audit(
        "vc_imported",
        &format!("Credential imported: {} ({})", input.label, input.credential_type),
        &format!(
            r#"{{"id":"{}","type":"{}","issuer":"{}"}}"#,
            id, input.credential_type, input.issuer_did
        ),
    )?;

    Ok(ImportCredentialOutput { id, action_hash })
}

/// List all non-revoked credentials in the wallet.
#[hdk_extern]
pub fn list_credentials(_: ()) -> ExternResult<Vec<CredentialWithHash>> {
    let records = query(
        QueryFilter::new()
            .include_entries(true)
            .action_type(ActionType::Create),
    )?;
    Ok(records
        .iter()
        .filter_map(|r| {
            r.entry()
                .to_app_option::<StoredCredential>()
                .ok()?
                .filter(|c| !c.revoked)
                .map(|credential| CredentialWithHash {
                    action_hash: r.action_hashed().hash.clone(),
                    credential,
                })
        })
        .collect())
}

/// Get a single credential by its ID.
#[hdk_extern]
pub fn get_credential(id: String) -> ExternResult<Option<CredentialWithHash>> {
    let records = query(
        QueryFilter::new()
            .include_entries(true)
            .action_type(ActionType::Create),
    )?;
    for record in records {
        if let Ok(Some(cred)) = record.entry().to_app_option::<StoredCredential>() {
            if cred.id == id {
                return Ok(Some(CredentialWithHash {
                    action_hash: record.action_hashed().hash.clone(),
                    credential: cred,
                }));
            }
        }
    }
    Ok(None)
}

/// Mark a credential as revoked (creates an update entry on the Source Chain).
#[hdk_extern]
pub fn revoke_credential(input: RevokeCredentialInput) -> ExternResult<ActionHash> {
    let existing = get_credential(input.credential_id.clone())?
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Credential not found".into())))?;

    let mut revoked = existing.credential.clone();
    revoked.revoked = true;

    let action_hash = update_entry(
        existing.action_hash,
        EntryTypes::StoredCredential(revoked),
    )?;

    append_audit(
        "vc_revoked",
        &format!("Credential revoked: {}", input.credential_id),
        &format!(r#"{{"id":"{}"}}"#, input.credential_id),
    )?;

    Ok(action_hash)
}

/// Return the full Source Chain audit log, most recent first.
#[hdk_extern]
pub fn get_audit_log(_: ()) -> ExternResult<Vec<AuditEntryWithHash>> {
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
                .to_app_option::<AuditEntry>()
                .ok()?
                .map(|entry| AuditEntryWithHash {
                    action_hash: r.action_hashed().hash.clone(),
                    entry,
                })
        })
        .collect())
}

// ??????????????????????????????? VALIDATION ????????????????????????????????

#[hdk_extern]
pub fn validate(op: Op) -> ExternResult<ValidateCallbackResult> {
    // Only validate Store operations
    let Op::StoreEntry(store_entry) = op else {
        return Ok(ValidateCallbackResult::Valid);
    };

    // Validate DidRecord entries
    if let Entry::App(bytes) = &store_entry.entry {
        let sb = SerializedBytes::from(bytes.clone());
        if let Ok(did) = DidRecord::try_from(sb.clone()) {
            if !did.did.starts_with("did:hc:") {
                return Ok(ValidateCallbackResult::Invalid(
                    "DID must use the did:hc method".into(),
                ));
            }
            return Ok(ValidateCallbackResult::Valid);
        }
        if let Ok(cred) = StoredCredential::try_from(sb) {
            if cred.id.is_empty() {
                return Ok(ValidateCallbackResult::Invalid(
                    "Credential ID is required".into(),
                ));
            }
            // Validate minimal SD-JWT structure
            if cred.token.split('.').count() < 3 {
                return Ok(ValidateCallbackResult::Invalid(
                    "Token must be a valid SD-JWT (header.payload.sig~...)".into(),
                ));
            }
        }
    }

    Ok(ValidateCallbackResult::Valid)
}

// ??????????????????????????????? HELPERS ???????????????????????????????????

fn append_audit(
    action_type: &str,
    description: &str,
    metadata: &str,
) -> ExternResult<ActionHash> {
    create_entry(EntryTypes::AuditEntry(AuditEntry {
        action_type:  action_type.into(),
        description:  description.into(),
        metadata:     metadata.into(),
        timestamp:    now_ts()?,
    }))
}

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

fn gen_id() -> ExternResult<String> {
    Ok(random_bytes(16)?
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect())
}
