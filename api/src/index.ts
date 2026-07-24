import { createApp } from "./app.js";
import { InMemoryBackend } from "./backends/inMemoryBackend.js";
import type { AutonymousBackend } from "./backend.js";

const PORT = Number(process.env.PORT ?? 3000);

function resolveBackend(): AutonymousBackend {
  // Default to the in-memory backend. The Holochain-backed adapter
  // (src/backends/holochainBackend.ts) exists but has not been
  // integration-tested against a live conductor in this environment, so it
  // is opt-in only until that verification happens.
  if (process.env.AUTONYMOUS_BACKEND === "holochain") {
    throw new Error(
      "AUTONYMOUS_BACKEND=holochain requires wiring up a live AppWebsocket " +
        "connection in src/index.ts; this has not been done/verified yet. " +
        "Unset AUTONYMOUS_BACKEND (or set it to 'memory') to use the in-memory backend.",
    );
  }
  return new InMemoryBackend();
}

const backend = resolveBackend();
const app = createApp(backend);

app.listen(PORT, () => {
  console.log(`Autonymous.me API listening on port ${PORT} (backend: in-memory)`);
});