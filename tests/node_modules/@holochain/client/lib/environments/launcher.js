const __HC_LAUNCHER_ENV__ = "__HC_LAUNCHER_ENV__";
const __HC_ZOME_CALL_SIGNER__ = "__HC_ZOME_CALL_SIGNER__";
export const isLauncher = () => globalThis.window && __HC_LAUNCHER_ENV__ in globalThis.window;
export const getLauncherEnvironment = () => isLauncher() ? globalThis.window[__HC_LAUNCHER_ENV__] : undefined;
export const getHostZomeCallSigner = () => globalThis.window && globalThis.window[__HC_ZOME_CALL_SIGNER__];
