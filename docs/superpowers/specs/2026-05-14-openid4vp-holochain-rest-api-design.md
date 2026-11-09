# OpenID4VP Holochain REST API Design

Date: 2026-05-14

## Goal

Build a real Autonymous.me OpenID4VP REST API backed by a Holochain 0.7 hApp. The API lets verifiers create OpenID4VP requests, wallets submit `direct_post` presentations, services inspect verification outcomes, and eIDAS bridge flows record cross-border authentication context without exposing raw Holochain zome-call details.

The current implementation targets the Holochain 0.7 compatibility set:

- `holochain` / `hc`: `0.7.0`
- `hdk`: `0.7.0`
- `hdi`: `0.8.0`
- `@holochain/client`: `0.21.0`
- JavaScript client: `@holochain/client` `0.20.x`
- Tryorama: `0.19.x`

The public protocol surface targets OpenID4VP 1.0, `response_type=vp_token`, `response_mode=direct_post`, DCQL, `dc+sd-jwt` credentials, and a live eIDAS workflow layer modeled on Receiving Member State / Sending Member State, Connector / Service, Proxy-Service, and Middleware-Service roles. The MVP includes live eIDAS-Node integration, conformance testing, and certification evidence workflows.

## Architecture

Use a domain REST gateway backed by real Holochain zome calls.

The gateway exposes stable OpenID4VP REST endpoints. Internally, it connects to the Holochain conductor admin websocket, discovers or attaches an app interface, issues an app authentication token, connects an app websocket, and invokes zome functions through the App API. Zome calls map to the conductor `AppRequest::CallZome` flow. The JS client handles the zome-call serialization, signing, and response decoding for normal gateway use.

Project layout:

```text
happ/
  dnas/
    autonymous/
      zomes/
        integrity/
          identity_registry/
        coordinator/
          issuer_registry/
          openid4vp/
          eidas_workflow/
          eidas_node/
          eidas_conformance/
          audit/
gateway/
  src/
    config.ts
    holochain-client.ts
    routes/
      health.ts
      issuers.ts
      openid4vp.ts
      eidas.ts
      eidas-node.ts
      conformance.ts
      certification.ts
      audit.ts
    schemas/
    errors.ts
```

The hApp owns persistent trust and audit state. The gateway owns HTTP concerns, JSON validation, connection management, and REST error mapping.

## Global Workflow

The global workflow starts with an eIDAS cross-border authentication need and uses OpenID4VP as the presentation and verification mechanism inside that flow.

```text
1. User requests a service
   Service Provider in the Receiving Member State starts an authentication flow.

2. eIDAS context is created
   The gateway records the Receiving Member State, requested Sending Member State,
   service provider metadata, connector mode, service mode, national scheme
   reference, and requested assurance level.

3. Live eIDAS-Node route is prepared
   The gateway selects Connector or Service behavior, loads the configured node
   metadata, prepares SAML/eIDAS protocol exchange parameters, and records
   evidence that the route is ready.

4. OpenID4VP request is created inside the eIDAS context
   The gateway creates a linked OpenID4VP request with nonce, state, DCQL query,
   accepted format, response URI, purpose, and expiry.

5. Wallet presents credential
   The wallet responds through `direct_post` with a `vp_token`.

6. Holochain verifies and records
   The hApp validates issuer trust, nonce, expiry, supported format, and replay
   state. It stores verification summaries and token hashes, not raw identity data.

7. Live eIDAS exchange is completed
   The eIDAS adapter sends or receives the required Connector/Service protocol
   result, maps the national authentication response to the common eIDAS context,
   and records evidence for conformance review.

8. eIDAS result is completed
   The eIDAS workflow context is updated with the authentication result and linked
   verification ID.

9. Service Provider receives result
   The Service Provider reads the verification outcome and proceeds with access.

10. Certification evidence is available
   The conformance module exposes scenario results, protocol evidence, security
   controls, privacy controls, and audit links needed for certification review.

11. Source Chain audit is available
   Request creation, eIDAS context creation, verification, result completion, and
   nonce consumption are visible as local audit events.
```

In other words, eIDAS is not a post-processing add-on. It is the outer cross-border authentication workflow. OpenID4VP is the privacy-preserving credential presentation mechanism used within that workflow. Holochain is the trust, state, and audit substrate for issuer registry, request lifecycle, verification events, live eIDAS node exchange state, conformance evidence, certification evidence, eIDAS context, and Source Chain history.

## Public REST API

`GET /health`

Returns gateway readiness and conductor/app connection status.

`GET /v1/.well-known/openid4vp`

Returns verifier metadata, supported formats, supported response modes, and endpoint URLs.

`POST /v1/issuers`

Registers or updates a trusted issuer. Calls `issuer_registry.register_issuer`.

`GET /v1/issuers/:issuerDid`

Reads trusted issuer metadata. Calls `issuer_registry.get_issuer`.

`POST /v1/openid4vp/requests`

Creates an authorization request with a fresh nonce, state, DCQL query, accepted credential format, response URI, purpose, expiry, and optional eIDAS authentication ID. Calls `openid4vp.create_request`.

`GET /v1/openid4vp/requests/:requestId`

Returns request state. Calls `openid4vp.get_request`.

`POST /v1/openid4vp/direct-post`

Wallet callback endpoint for `response_mode=direct_post`. Accepts `vp_token`, optional `presentation_submission`, `state`, and metadata. The gateway validates transport-level shape, then calls `openid4vp.verify_presentation`.

`GET /v1/openid4vp/verifications/:verificationId`

Returns the verification outcome. Calls `openid4vp.get_verification`.

`POST /v1/eidas/authentications`

Creates an eIDAS cross-border authentication context before or alongside the OpenID4VP request. Calls `eidas_workflow.create_authentication`.

`GET /v1/eidas/authentications/:authenticationId`

Returns the eIDAS workflow state, including Receiving Member State, Sending Member State, connector/service mode, linked request ID, and verification outcome. Calls `eidas_workflow.get_authentication`.

`POST /v1/eidas/authentications/:authenticationId/result`

Records the cross-border authentication result from the eIDAS bridge layer and links it to the verifier-facing OpenID4VP verification event. Calls `eidas_workflow.record_authentication_result`.

`POST /v1/eidas/nodes`

Registers a live eIDAS-Node configuration for Connector or Service operation. Calls `eidas_node.register_node`.

`GET /v1/eidas/nodes/:nodeId`

Returns node metadata, supported role, endpoint status, certificate metadata, and enabled Member State routes. Calls `eidas_node.get_node`.

`POST /v1/eidas/authentications/:authenticationId/dispatch`

Dispatches the authentication context through the configured live eIDAS Connector or Service adapter. Calls `eidas_node.dispatch_authentication`.

`POST /v1/eidas/callbacks/connector`

Receives live Connector-side eIDAS responses from a Sending Member State route. Calls `eidas_node.receive_connector_response`.

`POST /v1/eidas/callbacks/service`

Receives live Service-side eIDAS requests or middleware callbacks. Calls `eidas_node.receive_service_request`.

`POST /v1/eidas/conformance/runs`

Starts a conformance run for one or more eIDAS workflow scenarios. Calls `eidas_conformance.start_run`.

`GET /v1/eidas/conformance/runs/:runId`

Returns conformance scenario results, evidence links, failures, and readiness status. Calls `eidas_conformance.get_run`.

`GET /v1/eidas/certification/dossier`

Returns the MVP certification dossier index: conformance runs, evidence logs, security controls, privacy controls, audit hashes, and unresolved gaps. Calls `eidas_conformance.get_certification_dossier`.

`GET /v1/audit/source-chain`

Returns local audit entries for issuer registrations, request creation, verification attempts, and nonce consumption. Calls `audit.list_entries`.

## eIDAS Workflow Layer

Autonymous.me keeps OpenID4VP as the verifier/wallet API and adds an eIDAS bridge workflow for cross-border authentication context. The bridge models the high-level eID solution described by the European Commission:

1. A citizen requests an online service in a Member State.
2. The service asks the citizen to authenticate.
3. The flow detects that the citizen uses an eID from another Member State.
4. The authentication request is routed from the Receiving Member State to the Sending Member State through the eIDAS solution.
5. The Sending Member State authenticates the citizen through its Identity Provider or middleware.
6. The authentication result returns to the Service Provider.

In this design, the REST gateway creates an `EidasAuthenticationContext` first, then creates or links an OpenID4VP request inside that context. The eIDAS bridge records which Member State is receiving the request, which Member State is sending identity assurance, which connector/service mode is being used, and how the final result maps into the OpenID4VP verification event.

The MVP supports live data flow, conformance scenarios, and certification evidence for these eIDAS combinations:

- Proxy to Proxy
- Middleware to Proxy
- Proxy to Middleware
- Middleware to Middleware

The MVP includes live eIDAS-Node connectivity and adapter boundaries for national protocol translation. National protocol adapters are implemented as explicit connector modules with fixture-backed conformance tests and production configuration hooks. Full legal certification is represented as an evidence workflow: the software produces the technical dossier, evidence logs, conformance reports, and control mappings needed by certification or supervisory stakeholders, while final legal approval remains outside the software runtime.

## Live eIDAS Node Integration

The MVP includes an eIDAS Node adapter layer with two operating roles:

- `Connector`: used by the Receiving Member State to send cross-border authentication requests.
- `Service`: used by the Sending Member State to provide authentication through Proxy-Service or Middleware-Service routes.

The adapter layer must support:

- node metadata registration
- Connector and Service endpoint configuration
- SAML/eIDAS protocol message envelope generation and parsing
- signing certificate metadata and trust anchor references
- Member State route configuration
- request and response correlation with `EidasAuthenticationContext`
- callback validation
- protocol evidence capture for conformance and certification review

The adapter stores only protocol metadata, hashes, route state, status, and evidence references in Holochain. Raw national identity payloads and long-lived personal data are not stored.

## Conformance And Certification Workflow

The MVP includes a conformance module and certification dossier generator.

Conformance runs cover:

- Proxy to Proxy
- Middleware to Proxy
- Proxy to Middleware
- Middleware to Middleware
- invalid route rejection
- expired request rejection
- replay rejection
- missing trust anchor rejection
- malformed SAML/eIDAS envelope rejection
- OpenID4VP nonce and `state` consistency checks inside eIDAS flows

The certification dossier includes:

- implemented eIDAS roles and routes
- supported Member State configuration matrix
- protocol evidence hashes
- conformance run results
- security controls
- privacy controls
- data retention controls
- Source Chain audit references
- unresolved gaps and manual review notes

The dossier is technical evidence for review. It does not claim that the software is certified until an appropriate conformity assessment, supervisory, or certification process grants that status.

## Holochain Entries

`TrustedIssuer`

- `issuer_did`
- public keys, JWKs, or DID document reference
- supported credential formats
- trust status
- metadata
- created and updated timestamps

`PresentationRequest`

- `request_id`
- verifier DID or client ID
- nonce
- state
- DCQL query
- accepted formats
- response URI
- purpose
- expiry
- status
- optional eIDAS authentication ID

`VerificationEvent`

- `verification_id`
- `request_id`
- nonce
- issuer DID
- credential format
- disclosed claim keys
- result
- reason code
- VP token hash
- optional eIDAS authentication ID
- created timestamp

`EidasAuthenticationContext`

- `authentication_id`
- linked OpenID4VP request ID
- linked verification ID, when completed
- service provider ID and display name
- Receiving Member State
- Sending Member State
- connector mode
- service mode: proxy service or middleware service
- national scheme reference
- requested assurance level
- result status
- result reason code
- created and updated timestamps

`EidasNodeConfig`

- `node_id`
- role: connector or service
- Member State
- supported service modes
- endpoint URLs
- metadata URL or document hash
- signing certificate reference
- trust anchor reference
- enabled routes
- status
- created and updated timestamps

`EidasProtocolExchange`

- `exchange_id`
- authentication ID
- node ID
- direction: outbound or inbound
- protocol family
- message type
- correlation ID
- message hash
- validation status
- evidence reference
- created timestamp

`ConformanceRun`

- `run_id`
- scenario list
- target node IDs
- status
- result summary
- evidence references
- started and completed timestamps

`CertificationDossier`

- `dossier_id`
- generated timestamp
- conformance run IDs
- security control references
- privacy control references
- audit event hashes
- open gaps
- reviewer notes

`AuditEvent`

- event type
- actor
- object hash or ID
- summary
- previous audit hash
- timestamp

## Zome Functions

`issuer_registry.register_issuer(input) -> TrustedIssuer`

Creates or updates a trusted issuer record and writes an audit event.

`issuer_registry.get_issuer(issuer_did) -> Option<TrustedIssuer>`

Fetches issuer metadata by DID.

`openid4vp.create_request(input) -> PresentationRequest`

Creates a request, generates or stores a nonce/state pair, links the request to an eIDAS authentication context when provided, marks it pending, and writes an audit event.

`openid4vp.get_request(request_id) -> Option<PresentationRequest>`

Fetches request state.

`openid4vp.verify_presentation(input) -> VerificationEvent`

Validates request existence, expiry, nonce status, issuer trust, token format, and replay state. It stores only the token hash and disclosed claim summary, marks the nonce consumed on success, and writes an audit event.

`openid4vp.get_verification(verification_id) -> Option<VerificationEvent>`

Fetches verification outcome.

`eidas_workflow.create_authentication(input) -> EidasAuthenticationContext`

Creates the eIDAS cross-border authentication context, validates the connector/service mode, prepares it to receive a linked OpenID4VP request, and writes an audit event.

`eidas_workflow.get_authentication(authentication_id) -> Option<EidasAuthenticationContext>`

Fetches eIDAS workflow state.

`eidas_workflow.record_authentication_result(input) -> EidasAuthenticationContext`

Records the result returned through the eIDAS bridge, links it to a verification event when available, and writes an audit event.

`eidas_node.register_node(input) -> EidasNodeConfig`

Registers or updates a live eIDAS Node configuration, validates role and route declarations, and writes an audit event.

`eidas_node.get_node(node_id) -> Option<EidasNodeConfig>`

Fetches eIDAS Node configuration and current status.

`eidas_node.dispatch_authentication(input) -> EidasProtocolExchange`

Builds the Connector or Service protocol request for a live eIDAS exchange, correlates it to an authentication context, records protocol evidence, and writes an audit event.

`eidas_node.receive_connector_response(input) -> EidasProtocolExchange`

Validates a Connector-side response callback, maps it back to the authentication context, records protocol evidence, and writes an audit event.

`eidas_node.receive_service_request(input) -> EidasProtocolExchange`

Validates a Service-side request or middleware callback, maps it to a local authentication context, records protocol evidence, and writes an audit event.

`eidas_conformance.start_run(input) -> ConformanceRun`

Starts a conformance run across selected eIDAS scenarios and writes an audit event.

`eidas_conformance.get_run(run_id) -> Option<ConformanceRun>`

Fetches conformance results and evidence references.

`eidas_conformance.get_certification_dossier(input) -> CertificationDossier`

Generates a technical certification dossier from conformance runs, control mappings, protocol evidence, and Source Chain audit references.

`audit.list_entries(input) -> Vec<AuditEvent>`

Reads local audit entries for the app agent with pagination.

## Error Handling

The gateway fails closed:

- only configured app IDs are exposed
- only configured zome functions are callable
- JSON body size is limited
- raw `vp_token` values are never logged
- nonce replay returns a deterministic rejection
- expired requests cannot be verified
- unsupported formats are rejected before zome execution when possible
- invalid eIDAS connector/service combinations are rejected
- eIDAS result callbacks must reference an existing authentication context
- live eIDAS callbacks must validate message correlation, trust anchor references, and configured routes
- conformance runs must be immutable once completed
- certification dossiers must clearly distinguish technical evidence from granted certification status

HTTP errors use this shape:

```json
{
  "error": "invalid_vp_token",
  "message": "VP token signature could not be verified",
  "request_id": "req_...",
  "details": {}
}
```

Primary error codes:

- `bad_request`
- `unsupported_format`
- `issuer_not_trusted`
- `request_not_found`
- `request_expired`
- `nonce_replayed`
- `invalid_vp_token`
- `eidas_context_not_found`
- `invalid_eidas_workflow`
- `eidas_node_not_configured`
- `eidas_route_not_allowed`
- `eidas_protocol_validation_failed`
- `eidas_conformance_failed`
- `holochain_unavailable`
- `zome_call_failed`

## Security And Privacy

The REST gateway is not an identity database. It must not persist raw VP tokens, full disclosed payloads, private keys, raw national identity payloads, or holder identifiers. Holochain entries store request state, trust registry state, eIDAS workflow context, eIDAS node configuration metadata, protocol evidence hashes, verification summaries, token hashes, conformance results, certification dossier metadata, and local audit events.

The MVP supports `direct_post` for OpenID4VP and live eIDAS Connector/Service exchange for cross-border authentication. Transport deployments must use TLS outside local development. The verifier must always use the full client identifier, fresh nonces, expiry windows, and one-time nonce consumption. eIDAS fields are workflow metadata and protocol evidence, and certification status must only be reported as granted after the appropriate external assessment process completes.

## Testing

Rust zome tests:

- entry validation for trusted issuers, presentation requests, verification events, and audit events
- nonce state transitions
- request expiry behavior
- issuer trust checks
- eIDAS workflow mode validation
- eIDAS node configuration validation
- protocol exchange evidence hashing
- conformance run immutability
- certification dossier generation

Tryorama tests:

- register issuer across agents
- create request
- verify presentation
- reject replay with the same nonce
- create eIDAS context linked to an OpenID4VP request
- register live eIDAS Connector and Service node configurations
- dispatch eIDAS authentication through configured route
- record eIDAS result linked to a verification event
- run conformance scenarios for Proxy/Proxy, Middleware/Proxy, Proxy/Middleware, and Middleware/Middleware
- generate certification dossier with audit references
- read audit entries

Gateway tests:

- request validation and error mapping
- route-to-zome mapping
- conductor unavailable behavior
- eIDAS route validation and zome mapping
- eIDAS callback validation
- conformance route validation
- certification dossier route validation
- no raw VP token logging in test logger output

Minimum happy path:

1. Register trusted issuer.
2. Register live eIDAS Connector and Service node configurations.
3. Create eIDAS authentication context for Receiving/Sending Member State workflow.
4. Dispatch the context through the configured eIDAS route.
5. Create OpenID4VP request linked to the eIDAS context.
6. Submit `direct_post` VP token.
7. Verify issuer and nonce.
8. Store verification event linked to the eIDAS context.
9. Complete live eIDAS authentication result.
10. Reject second submission with same nonce.
11. Run conformance scenario covering the completed route.
12. Generate certification dossier with evidence and audit references.
13. Read Source Chain audit entries.

## Delivery

The implementation should include:

- hApp scaffold and manifests
- Rust integrity and coordinator zomes
- TypeScript REST gateway
- eIDAS workflow REST routes and zome functions
- live eIDAS Node adapter routes and zome functions
- conformance runner routes and zome functions
- certification dossier route and generation logic
- environment configuration examples
- live eIDAS node configuration examples
- build and run scripts
- curl examples for each endpoint
- conformance scenario fixtures
- certification dossier example output
- a README section explaining conductor setup, hApp installation, gateway startup, live eIDAS node setup, conformance runs, certification dossier generation, and API use

The first version deliberately excludes mobile wallet UI, browser extension support, encrypted `direct_post.jwt`, production DID resolution, and every credential format beyond `dc+sd-jwt`. It includes live eIDAS Node integration, national protocol adapter boundaries, conformance workflows, and certification evidence workflows as MVP scope.
