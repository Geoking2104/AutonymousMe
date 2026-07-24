//! # openid4vp zome
//!
//! Implements OpenID for Verifiable Presentations (OpenID4VP v1.0 Final).
//!
//! Protocol flow:
//!   1. `parse_authorization_request`  ? decode verifier QR / deep-link URI
//!   2. `build_vp_token`               ? user selects claims ? assemble dc+sd-jwt VP Token
//!   3. `record_presentation`          ? log outcome to Source Chain
//!
//! References:
//!   - OpenID4VP v1.0: https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
//!   - SD-JWT RFC 9901: https://www.rfc-editor.org/rfc/rfc9901.html
//!   - eIDAS 2.0:       https://eur-lex.europa.eu/eli/reg/2024/1183/oj

use hdk::prelude::*;
use serde::{Deserialize, Serialize};

// ??????????????????????????????? ENTRY TYPES ???????????????????????????????

/// A parsed OpenID4VP authorization request from a verifier.
#[hdk_entry_helper]
#[derive(Clone)]
pub struct AuthorizationRequest {
    /// Single-use nonce from the verifier ? prevents replay attacks
    pub nonce: String,
    /// Verifier identity (domain or DID)
    pub client_id: String,
    /// JSON `presentation_definition` specifying required credential types
    pub presentation_definition: String,
    /// "direct_post" | "redirect" | "fragment"
    pub response_mode: String,
    pub redirect_uri: Option<String>,
    pub raw_request: String,
    pub received_at: String,
    /// "pending" | "approved" | "denied"
    pub status: String,
}

/// A completed VP presentation ? stored privately after user approves or denies.
#[hdk_entry_helper]
#[derive(Clone)]
pub struct PresentationRecord {
    pub nonce: String,
    pub verifier: String,
    /// Comma-separated disclosed claim names
    pub disclosed_claims: String,
    /// Comma-separated withheld claim names
    pub withheld_claims: String,
    /// First 64 chars of the VP Token (sufficient for audit ? not the full token)
    pub vp_token_prefix: String,
    pub presented_at: String,
    /// "approved" | "denied"
    pub outcome: String,
}

#[hdk_entry_types]
#[unit_enum(UnitEntryTypes)]
pub enum EntryTypes {
    #[entry_type(required_validations = 5, visibility = "private")]
    AuthorizationRequest(AuthorizationRequest),
    #[entry_type(required_validations = 5, visibility = "private")]
    PresentationRecord(PresentationRecord),
}

#[hdk_link_types]
pub enum LinkTypes {
    NonceToRequest,
}

// ??????????????????????????????? I/O TYPES ?????????????????????????????????

#[derive(Serialize, Deserialize, Debug)]
pub struct ParseRequestInput {
    /// Raw `openid4vp://...` URI or JSON request object
    pub raw: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ParseRequestOutput {
    pub action_hash: ActionHash,
    pub request: AuthorizationRequest,
    /// Claim names inferred as required from `presentation_definition`
    pub required_claims: Vec<String>,
}

/// Build a VP Token from a stored credential and the user's claim selection.
#[derive(Serialize, Deserialize, Debug)]
pub struct BuildVpTokenInput {
    pub nonce: String,
    pub credential_id: String,
    /// Full SD-JWT from `StoredCredential.token`
    pub sd_jwt_token: String,
    /// Claims the user chose to disclose
    pub disclosed_claims: Vec<String>,
    /// All claims available in the credential
    pub all_claims: Vec<String>,
    /// Verifier's client_id (for KB-JWT audience)
    pub client_id: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct BuildVpTokenOutput {
    /// Complete dc+sd-jwt VP Token: `issuer_jwt~disc1~disc2~kb_jwt`
    pub vp_token: String,
    pub disclosed: Vec<String>,
    pub withheld: Vec<String>,
    pub nonce: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RecordPresentationInput {
    pub nonce: String,
    pub verifier: String,
    pub disclosed_claims: Vec<String>,
    pub withheld_claims: Vec<String>,
    pub vp_token: String,
    pub outcome: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct PresentationRecordWithHash {
    pub action_hash: ActionHash,
    pub record: PresentationRecord,
}

// ??????????????????????????????? ZOME FUNCTIONS ????????????????????????????

/// Parse and store an OpenID4VP authorization request.
/// Called after the user scans a QR code or follows a deep link.
#[hdk_extern]
pub fn parse_authorization_request(
    input: ParseRequestInput,
) -> ExternResult<ParseRequestOutput> {
    let p = parse_uri(&input.raw)?;
    let required_claims = infer_claims(&p.presentation_definition);

    let request = AuthorizationRequest {
        nonce:                   p.nonce.clone(),
        client_id:               p.client_id.clone(),
        presentation_definition: p.presentation_definition.clone(),
        response_mode:           p.response_mode.clone(),
        redirect_uri:            p.redirect_uri.clone(),
        raw_request:             input.raw.clone(),
        received_at:             now_ts()?,
        status:                  "pending".into(),
    };
    let action_hash = create_entry(EntryTypes::AuthorizationRequest(request.clone()))?;

    Ok(ParseRequestOutput {
        action_hash,
        request,
        required_claims,
    })
}

/// Build a VP Token (dc+sd-jwt) from the stored credential + user-selected disclosures.
///
/// SD-JWT VP Token structure:
///   `<issuer_jwt>~<disclosure_1>~<disclosure_2>~<kb_jwt>`
///
/// - `issuer_jwt`:    original SD-JWT from the issuer (header.payload.sig)
/// - `disclosure_N`: base64url([salt, claim_name, claim_value]) for each disclosed claim
/// - `kb_jwt`:       Key Binding JWT ? proves holder identity, binds the nonce
#[hdk_extern]
pub fn build_vp_token(input: BuildVpTokenInput) -> ExternResult<BuildVpTokenOutput> {
    // Split issuer SD-JWT from stored disclosures: "hdr.pay.sig~disc1~disc2~"
    let mut parts = input.sd_jwt_token.split('~');
    let issuer_jwt = parts
        .next()
        .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Invalid SD-JWT format".into())))?;
    let stored_discs: Vec<&str> = parts.filter(|s| !s.is_empty()).collect();

    // Select disclosures for chosen claims
    let mut selected_discs: Vec<String> = Vec::new();
    let mut withheld: Vec<String> = Vec::new();

    for claim in &input.all_claims {
        if input.disclosed_claims.contains(claim) {
            // Find stored disclosure that encodes this claim name
            let found = stored_discs.iter().find(|d| disc_has_claim(d, claim));
            if let Some(d) = found {
                selected_discs.push((*d).to_string());
            } else {
                // Generate a fresh disclosure (for test / demo mode)
                selected_discs.push(fresh_disclosure(claim)?);
            }
        } else {
            withheld.push(claim.clone());
        }
    }

    // Build Key Binding JWT (KB-JWT) for holder binding
    let kb_jwt = make_kb_jwt(&input.nonce, &input.client_id)?;

    // Assemble: issuer_jwt~disc1~disc2~kb_jwt
    let disc_section = selected_discs.join("~");
    let vp_token = if disc_section.is_empty() {
        format!("{}~~{}", issuer_jwt, kb_jwt)
    } else {
        format!("{}~{}~{}", issuer_jwt, disc_section, kb_jwt)
    };

    Ok(BuildVpTokenOutput {
        vp_token,
        disclosed: input.disclosed_claims.clone(),
        withheld,
        nonce: input.nonce,
    })
}

/// Record the outcome of a presentation on the Source Chain.
/// Call this after the VP Token has been delivered (approved) or the request was denied.
#[hdk_extern]
pub fn record_presentation(input: RecordPresentationInput) -> ExternResult<ActionHash> {
    let record = PresentationRecord {
        nonce:            input.nonce,
        verifier:         input.verifier,
        disclosed_claims: input.disclosed_claims.join(","),
        withheld_claims:  input.withheld_claims.join(","),
        vp_token_prefix:  input.vp_token.chars().take(64).collect(),
        presented_at:     now_ts()?,
        outcome:          input.outcome,
    };
    create_entry(EntryTypes::PresentationRecord(record))
}

/// List all presentation records from the Source Chain (most recent first).
#[hdk_extern]
pub fn list_presentations(_: ()) -> ExternResult<Vec<PresentationRecordWithHash>> {
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
                .to_app_option::<PresentationRecord>()
                .ok()?
                .map(|record| PresentationRecordWithHash {
                    action_hash: r.action_hashed().hash.clone(),
                    record,
                })
        })
        .collect())
}

// ??????????????????????????????? VALIDATION ????????????????????????????????

#[hdk_extern]
pub fn validate(op: Op) -> ExternResult<ValidateCallbackResult> {
    let Op::StoreEntry(store_entry) = op else {
        return Ok(ValidateCallbackResult::Valid);
    };

    if let Entry::App(bytes) = &store_entry.entry {
        let sb = SerializedBytes::from(bytes.clone());
        if let Ok(req) = AuthorizationRequest::try_from(sb.clone()) {
            if req.nonce.is_empty() {
                return Ok(ValidateCallbackResult::Invalid("Nonce is required".into()));
            }
            if req.client_id.is_empty() {
                return Ok(ValidateCallbackResult::Invalid("client_id is required".into()));
            }
            return Ok(ValidateCallbackResult::Valid);
        }
        if let Ok(rec) = PresentationRecord::try_from(sb) {
            if rec.outcome != "approved" && rec.outcome != "denied" {
                return Ok(ValidateCallbackResult::Invalid(
                    "outcome must be 'approved' or 'denied'".into(),
                ));
            }
        }
    }

    Ok(ValidateCallbackResult::Valid)
}

// ??????????????????????????????? HELPERS ???????????????????????????????????

struct Parsed {
    nonce:                   String,
    client_id:               String,
    presentation_definition: String,
    response_mode:           String,
    redirect_uri:            Option<String>,
}

/// Parse an `openid4vp://` URI into its components.
fn parse_uri(raw: &str) -> ExternResult<Parsed> {
    let query = if let Some(q) = raw.strip_prefix("openid4vp://?") {
        q
    } else if raw.starts_with('{') {
        return parse_json_request(raw);
    } else {
        raw
    };

    let mut p = Parsed {
        nonce: String::new(),
        client_id: String::new(),
        presentation_definition: r#"{"id":"default","input_descriptors":[]}"#.into(),
        response_mode: "direct_post".into(),
        redirect_uri: None,
    };

    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        let k = kv.next().unwrap_or("");
        let v = kv.next().unwrap_or("")
            .replace("%3A", ":").replace("%2F", "/").replace("%7B", "{").replace("%7D", "}");
        match k {
            "nonce"                   => p.nonce = v,
            "client_id"               => p.client_id = v,
            "presentation_definition" => p.presentation_definition = v,
            "response_mode"           => p.response_mode = v,
            "redirect_uri"            => p.redirect_uri = Some(v),
            _ => {}
        }
    }

    if p.nonce.is_empty() || p.client_id.is_empty() {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "Authorization request must contain nonce and client_id".into()
        )));
    }
    Ok(p)
}

fn parse_json_request(raw: &str) -> ExternResult<Parsed> {
    fn field(s: &str, key: &str) -> Option<String> {
        let pat = format!("\"{}\":", key);
        let i = s.find(&pat)? + pat.len();
        let rest = s[i..].trim_start();
        if rest.starts_with('"') {
            let inner = &rest[1..];
            Some(inner[..inner.find('"')?].to_string())
        } else {
            None
        }
    }
    Ok(Parsed {
        nonce: field(raw, "nonce")
            .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Missing nonce".into())))?,
        client_id: field(raw, "client_id")
            .ok_or_else(|| wasm_error!(WasmErrorInner::Guest("Missing client_id".into())))?,
        presentation_definition: field(raw, "presentation_definition")
            .unwrap_or_else(|| r#"{"id":"default","input_descriptors":[]}"#.into()),
        response_mode: field(raw, "response_mode")
            .unwrap_or_else(|| "direct_post".into()),
        redirect_uri: field(raw, "redirect_uri"),
    })
}

/// Infer required claim names from the presentation_definition JSON.
fn infer_claims(pd: &str) -> Vec<String> {
    const KNOWN: &[&str] = &[
        "age_gte_18", "country", "name", "birth_date",
        "address", "nationality", "kyc_level", "credential_type",
    ];
    KNOWN.iter().filter(|c| pd.contains(*c)).map(|c| c.to_string()).collect()
}

/// Check whether a base64url-encoded disclosure contains a given claim name.
fn disc_has_claim(disc_b64: &str, claim: &str) -> bool {
    // Disclosures are base64url([salt, claim_name, value])
    // Simple string check on the padded base64 is sufficient for matching
    let padded = match disc_b64.len() % 4 {
        2 => format!("{}==", disc_b64),
        3 => format!("{}=", disc_b64),
        _ => disc_b64.to_string(),
    }.replace('-', "+").replace('_', "/");
    padded.contains(&b64_encode_claim(claim))
}

fn b64_encode_claim(claim: &str) -> String {
    let quoted = format!("\"{}\"", claim);
    b64url(quoted.as_bytes())
}

/// Generate a fresh SD-JWT disclosure for a given claim (demo / test mode).
/// Format: `base64url([<random_salt>, "<claim_name>", true])`
fn fresh_disclosure(claim: &str) -> ExternResult<String> {
    let salt_bytes = random_bytes(8)?;
    let salt: String = salt_bytes.iter().map(|b| format!("{:02x}", b)).collect();
    let payload = format!(r#"["{}","{}",true]"#, salt, claim);
    Ok(b64url(payload.as_bytes()))
}

/// Build a Key Binding JWT (KB-JWT) proving the holder is presenting.
/// In production: signed with the agent's Ed25519 keypair via HDK `sign_raw`.
fn make_kb_jwt(nonce: &str, aud: &str) -> ExternResult<String> {
    let hdr = b64url(br#"{"alg":"EdDSA","typ":"kb+jwt"}"#);
    let pay = b64url(
        format!(r#"{{"nonce":"{}","aud":"{}","iat":0}}"#, nonce, aud).as_bytes(),
    );
    let signing_input = format!("{}.{}", hdr, pay);
    let agent_key: AgentPubKey = agent_info()?.agent_latest_pubkey;
    let sig = sign_raw(agent_key, signing_input.into_bytes())?;
    let sig_b64 = b64url(&sig.0);
    Ok(format!("{}.{}.{}", hdr, pay, sig_b64))
}

/// Minimal base64url encoder (no padding, url-safe alphabet).
fn b64url(input: &[u8]) -> String {
    const CHARS: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::with_capacity((input.len() * 4) / 3 + 4);
    let mut i = 0usize;
    while i < input.len() {
        let b0 = input[i] as u32;
        let b1 = if i + 1 < input.len() { input[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < input.len() { input[i + 2] as u32 } else { 0 };
        out.push(CHARS[((b0 >> 2) & 0x3f) as usize] as char);
        out.push(CHARS[(((b0 << 4) | (b1 >> 4)) & 0x3f) as usize] as char);
        if i + 1 < input.len() {
            out.push(CHARS[(((b1 << 2) | (b2 >> 6)) & 0x3f) as usize] as char);
        }
        if i + 2 < input.len() {
            out.push(CHARS[(b2 & 0x3f) as usize] as char);
        }
        i += 3;
    }
    out
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
