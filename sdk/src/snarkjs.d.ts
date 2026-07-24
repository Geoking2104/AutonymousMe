/**
 * Minimal ambient type declaration for the `snarkjs` package, which does not
 * ship its own TypeScript types. Only the subset used by this SDK is typed.
 */
declare module "snarkjs" {
  export const groth16: {
    verify(
      verificationKey: unknown,
      publicSignals: string[],
      proof: unknown,
    ): Promise<boolean>;
    fullProve(
      input: Record<string, unknown>,
      wasmFile: string,
      zkeyFile: string,
    ): Promise<{ proof: unknown; publicSignals: string[] }>;
  };
}