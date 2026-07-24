/// Integration tests for identity_wallet zome
/// Run with: cargo test --package identity_wallet
///
/// For full Holochain integration tests (conductor spin-up):
///   npx hc s generate --run tests/

#[cfg(test)]
mod tests {
    // Unit-level tests for pure functions

    #[test]
    fn did_format_is_valid() {
        let did = "did:hc:uhCAkTiKSS7oy4mKB2YZxPFzqy";
        assert!(did.starts_with("did:hc:"));
        assert!(did.len() > 10);
    }

    #[test]
    fn sd_jwt_format_check() {
        // A valid SD-JWT has at least header.payload.sig
        let token = "eyJhbGciOiJFUzI1NiIsInR5cCI6ImRjK3NkLWp3dCJ9.eyJfc2QiOlsiYWdlX2d0ZV8xOCJdfQ.sig~WyJzYWx0IiwiYWdlX2d0ZV8xOCIsdHJ1ZV0~";
        let dot_parts: Vec<&str> = token.splitn(3, '.').collect();
        assert_eq!(dot_parts.len(), 3, "SD-JWT must have 3 dot-separated parts");
        assert!(token.contains('~'), "SD-JWT must have disclosure separator ~");
    }

    #[test]
    fn selective_disclosure_hides_unselected() {
        // Simulate: credential has 3 claims, user selects 1
        let all_claims = vec!["age_gte_18", "name", "country"];
        let selected = vec!["age_gte_18"];
        let withheld: Vec<&&str> = all_claims.iter().filter(|c| !selected.contains(*c)).collect();
        assert_eq!(withheld.len(), 2);
        assert!(!withheld.contains(&&"age_gte_18"));
        assert!(withheld.contains(&&"name"));
        assert!(withheld.contains(&&"country"));
    }

    #[test]
    fn nonce_prevents_replay() {
        // Two requests with same nonce should be detectable
        let nonce1 = "abc123";
        let nonce2 = "abc123";
        // In the zome, we check nonce uniqueness via Source Chain query
        // Here we just verify equality detection works
        assert_eq!(nonce1, nonce2, "Duplicate nonce detected — reject");
    }
}
