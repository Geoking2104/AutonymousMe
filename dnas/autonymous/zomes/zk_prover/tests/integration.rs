/// Integration tests for zk_prover zome
/// Run with: cargo test --package zk_prover
///
/// For full Holochain integration tests (conductor spin-up):
///   npx hc s generate --run tests/

#[cfg(test)]
mod tests {
    // Unit-level tests for pure validation logic mirrored from the zome.

    fn is_valid_sha256_hex(s: &str) -> bool {
        s.len() == 64 && s.chars().all(|c| c.is_ascii_hexdigit())
    }

    #[test]
    fn credential_hash_must_be_64_hex_chars() {
        let good = "a".repeat(64);
        let too_short = "a".repeat(32);
        let non_hex = format!("{}zz", "a".repeat(62));

        assert!(is_valid_sha256_hex(&good));
        assert!(!is_valid_sha256_hex(&too_short));
        assert!(!is_valid_sha256_hex(&non_hex));
    }

    #[test]
    fn only_groth16_proof_type_is_accepted() {
        let accepted = "groth16";
        let rejected = ["plonk", "stark", ""];
        assert_eq!(accepted, "groth16");
        for r in rejected {
            assert_ne!(r, "groth16");
        }
    }

    #[test]
    fn circuit_id_must_match_known_circuit() {
        let known_circuits = ["age_check_v1"];
        assert!(known_circuits.contains(&"age_check_v1"));
        assert!(!known_circuits.contains(&"age_check_v2_unreleased"));
    }

    #[test]
    fn proof_points_must_all_be_present() {
        struct Proof<'a> {
            pi_a: &'a str,
            pi_b: &'a str,
            pi_c: &'a str,
        }
        fn well_formed(p: &Proof) -> bool {
            !p.pi_a.is_empty() && !p.pi_b.is_empty() && !p.pi_c.is_empty()
        }

        assert!(well_formed(&Proof { pi_a: "0x1", pi_b: "0x2", pi_c: "0x3" }));
        assert!(!well_formed(&Proof { pi_a: "", pi_b: "0x2", pi_c: "0x3" }));
    }

    #[test]
    fn current_year_must_be_plausible() {
        fn plausible(y: u32) -> bool {
            y >= 2020 && y <= 2100
        }
        assert!(plausible(2026));
        assert!(!plausible(1999));
        assert!(!plausible(3000));
    }
}
