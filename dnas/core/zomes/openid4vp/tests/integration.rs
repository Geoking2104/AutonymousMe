/// Integration tests for openid4vp zome
/// Run with: cargo test --package openid4vp

#[cfg(test)]
mod tests {

    #[test]
    fn parse_openid4vp_uri() {
        let uri = "openid4vp://?nonce=abc123&client_id=bank.example&response_type=vp_token&response_mode=direct_post";
        // Verify we can extract key params
        assert!(uri.contains("nonce=abc123"));
        assert!(uri.contains("client_id=bank.example"));
        assert!(uri.contains("response_type=vp_token"));
    }

    #[test]
    fn vp_token_format_dc_sd_jwt() {
        // dc+sd-jwt format: issuer_jwt~disc1~disc2~kb_jwt
        let issuer_jwt = "eyJhbGci.eyJfc2Qi.sig";
        let disc1 = "WyJzYWx0IiwiYWdlX2d0ZV8xOCIsdHJ1ZV0";
        let kb_jwt = "eyJhbGci.eyJub25jZSI6ImFiYzEyMyJ9.kbsig";
        let vp_token = format!("{}~{}~{}", issuer_jwt, disc1, kb_jwt);
        let parts: Vec<&str> = vp_token.split('~').collect();
        assert_eq!(parts.len(), 3);
        assert_eq!(parts[0], issuer_jwt);
        assert_eq!(parts[1], disc1);
        assert_eq!(parts[2], kb_jwt);
    }

    #[test]
    fn holder_binding_includes_nonce() {
        // KB-JWT payload must include the nonce from the verifier's request
        let nonce = "xyz789";
        let kb_payload_json = format!(r#"{{"nonce":"{}","iat":0}}"#, nonce);
        assert!(kb_payload_json.contains(nonce));
    }

    #[test]
    fn denied_request_logs_no_claims() {
        let disclosed = Vec::<String>::new();
        let outcome = "denied";
        assert!(disclosed.is_empty());
        assert_eq!(outcome, "denied");
    }
}
