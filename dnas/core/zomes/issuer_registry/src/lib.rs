//! Phase 4 issuer registry.
//!
//! Issuers publish a self-certifying `did:hc` profile to the DHT. A registry
//! record is immutable: a changed profile must be published under a new DID.

use hdi::prelude::{FlatOp, OpEntry, OpLink};
use hdk::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

const ISSUER_INDEX: &str = "autonymous.issuer-registry.v1";

#[hdk_entry_helper]
#[derive(Clone, PartialEq)]
pub struct IssuerRecord {
    pub issuer_did: String,
    pub display_name: String,
    pub credential_types: Vec<String>,
    pub verification_method: String,
    pub controller: AgentPubKey,
    pub registered_at: String,
}

#[hdk_entry_types]
#[unit_enum(UnitEntryTypes)]
pub enum EntryTypes {
    #[entry_type(required_validations = 5, visibility = "public")]
    IssuerRecord(IssuerRecord),
}

#[hdk_link_types]
pub enum LinkTypes {
    AllIssuers,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct RegisterIssuerInput {
    pub display_name: String,
    pub credential_types: Vec<String>,
    pub verification_method: String,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct IssuerRecordWithHash {
    pub action_hash: ActionHash,
    pub issuer: IssuerRecord,
}

#[hdk_extern]
pub fn register_issuer(input: RegisterIssuerInput) -> ExternResult<IssuerRecordWithHash> {
    validate_registration_input(&input)?;

    let controller = agent_info()?.agent_initial_pubkey;
    let issuer_did = format!("did:hc:{}", controller);
    if get_issuer(issuer_did.clone())?.is_some() {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "This agent already has a registered issuer profile".into(),
        )));
    }

    let issuer = IssuerRecord {
        issuer_did: issuer_did.clone(),
        display_name: input.display_name,
        credential_types: input.credential_types,
        verification_method: input.verification_method,
        controller,
        registered_at: sys_time()?.to_string(),
    };
    let action_hash = create_entry(EntryTypes::IssuerRecord(issuer.clone()))?;
    create_link(
        issuer_index_hash()?,
        action_hash.clone(),
        LinkTypes::AllIssuers,
        LinkTag::new(issuer_did.into_bytes()),
    )?;

    Ok(IssuerRecordWithHash {
        action_hash,
        issuer,
    })
}

#[hdk_extern]
pub fn get_issuer(issuer_did: String) -> ExternResult<Option<IssuerRecordWithHash>> {
    Ok(list_issuers(())?
        .into_iter()
        .find(|record| record.issuer.issuer_did == issuer_did))
}

#[hdk_extern]
pub fn list_issuers(_: ()) -> ExternResult<Vec<IssuerRecordWithHash>> {
    let links = get_links(
        LinkQuery::try_new(issuer_index_hash()?, LinkTypes::AllIssuers)?,
        GetStrategy::default(),
    )?;
    let mut issuers = BTreeMap::<String, IssuerRecordWithHash>::new();

    for link in links {
        let Some(action_hash) = link.target.into_action_hash() else {
            continue;
        };
        let Some(record) = get(action_hash.clone(), GetOptions::network())? else {
            continue;
        };
        let Some(issuer) = record
            .entry()
            .to_app_option::<IssuerRecord>()
            .map_err(|error| wasm_error!(WasmErrorInner::Guest(error.to_string())))?
        else {
            continue;
        };
        issuers.insert(
            issuer.issuer_did.clone(),
            IssuerRecordWithHash {
                action_hash,
                issuer,
            },
        );
    }

    Ok(issuers.into_values().collect())
}

#[hdk_extern]
pub fn validate(op: Op) -> ExternResult<ValidateCallbackResult> {
    match op.flattened::<EntryTypes, LinkTypes>()? {
        FlatOp::CreateEntry(OpEntry::CreateEntry {
            app_entry: EntryTypes::IssuerRecord(issuer),
            action,
        }) => validate_issuer_record(&issuer, action.author()),
        FlatOp::Update(_) => Ok(ValidateCallbackResult::Invalid(
            "Issuer records are immutable; publish a new DID instead".into(),
        )),
        FlatOp::Delete(_) => Ok(ValidateCallbackResult::Invalid(
            "Issuer records cannot be deleted".into(),
        )),
        FlatOp::Link(OpLink::CreateLink {
            link_type: LinkTypes::AllIssuers,
            action,
        }) => {
            let expected_base: AnyLinkableHash = issuer_index_hash()?.into();
            if action.base_address != expected_base {
                return Ok(ValidateCallbackResult::Invalid(
                    "Issuer index links must use the canonical registry base".into(),
                ));
            }
            if action.tag.0.is_empty() || action.target_address.clone().into_action_hash().is_none()
            {
                return Ok(ValidateCallbackResult::Invalid(
                    "Issuer index links require a DID tag and action-hash target".into(),
                ));
            }
            Ok(ValidateCallbackResult::Valid)
        }
        FlatOp::Link(OpLink::DeleteLink { .. }) => Ok(ValidateCallbackResult::Invalid(
            "Issuer index links cannot be deleted".into(),
        )),
        _ => Ok(ValidateCallbackResult::Valid),
    }
}

fn issuer_index_hash() -> ExternResult<EntryHash> {
    Path::from(ISSUER_INDEX).path_entry_hash()
}

fn validate_registration_input(input: &RegisterIssuerInput) -> ExternResult<()> {
    if input.display_name.trim().is_empty() {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "display_name is required".into(),
        )));
    }
    if input.credential_types.is_empty()
        || input
            .credential_types
            .iter()
            .any(|value| value.trim().is_empty())
    {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "At least one non-empty credential type is required".into(),
        )));
    }
    if input.verification_method.trim().is_empty() {
        return Err(wasm_error!(WasmErrorInner::Guest(
            "verification_method is required".into(),
        )));
    }
    Ok(())
}

fn validate_issuer_record(
    issuer: &IssuerRecord,
    author: &AgentPubKey,
) -> ExternResult<ValidateCallbackResult> {
    let expected_did = format!("did:hc:{}", author);
    if issuer.controller != *author || issuer.issuer_did != expected_did {
        return Ok(ValidateCallbackResult::Invalid(
            "Issuer DID and controller must identify the authoring agent".into(),
        ));
    }
    if issuer.display_name.trim().is_empty()
        || issuer.credential_types.is_empty()
        || issuer.verification_method.trim().is_empty()
    {
        return Ok(ValidateCallbackResult::Invalid(
            "Issuer profile fields must not be empty".into(),
        ));
    }
    Ok(ValidateCallbackResult::Valid)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn valid_input() -> RegisterIssuerInput {
        RegisterIssuerInput {
            display_name: "Example University".into(),
            credential_types: vec!["DegreeCredential".into()],
            verification_method: "did:hc:example#agent-key".into(),
        }
    }

    #[test]
    fn accepts_complete_registration_input() {
        assert!(validate_registration_input(&valid_input()).is_ok());
    }

    #[test]
    fn rejects_empty_registration_fields() {
        let mut input = valid_input();
        input.display_name = " ".into();
        assert!(validate_registration_input(&input).is_err());

        let mut input = valid_input();
        input.credential_types.clear();
        assert!(validate_registration_input(&input).is_err());

        let mut input = valid_input();
        input.verification_method.clear();
        assert!(validate_registration_input(&input).is_err());
    }
}
