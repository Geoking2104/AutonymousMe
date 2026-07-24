pragma circom 2.1.4;

include "circomlib/circuits/comparators.circom";

// AgeCheck proves that (current_year - birth_year) >= 18 without revealing
// birth_year. `credential_hash` is a public input that binds this proof to
// one specific SD-JWT credential, so it cannot be replayed against another.
//
// Note on the spec pseudocode (Technical_Specifications.docx section 6.1):
// the document shows `age_ok <== age >= 18 ? 1 : 0;`, which is illustrative
// but not valid Circom -- comparisons must go through a bounded comparator
// circuit (circomlib's GreaterEqThan) so the constraint system stays sound.
// This file is the corrected, actually-compilable version of that circuit.
template AgeCheck() {
    signal input birth_year;       // private
    signal input current_year;     // public
    signal input credential_hash;  // public - binds proof to one SD-JWT
    signal output age_ok;

    signal age;
    age <== current_year - birth_year;

    // 8 bits is enough headroom for any realistic age (0-255)
    component gte = GreaterEqThan(8);
    gte.in[0] <== age;
    gte.in[1] <== 18;
    age_ok <== gte.out;

    // credential_hash is not further constrained in this v1 circuit -- it is
    // carried through as a public signal so the proof + VP Token can be
    // bound together off-circuit (see docs/happ-architecture.md, section 6.3
    // "Proof Embedding in VP Token"). A future version should fold it into a
    // Poseidon commitment check against a credential Merkle root.
    signal credentialHashCheck;
    credentialHashCheck <== credential_hash * 1;
}

component main {public [current_year, credential_hash]} = AgeCheck();
