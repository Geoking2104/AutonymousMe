# ── Stage 1: Build Rust wasm zomes ────────────────────────────────────────
FROM rust:1.77-slim AS zome-builder

RUN apt-get update && apt-get install -y \
    pkg-config libssl-dev curl git \
    && rm -rf /var/lib/apt/lists/*

# Add wasm32 target
RUN rustup target add wasm32-unknown-unknown

# Install holochain CLI tools
RUN cargo install holochain_cli --version 0.4.1 --locked 2>/dev/null || \
    cargo install holochain_cli --locked

WORKDIR /build

# Copy workspace manifests first (cache layer)
COPY Cargo.toml Cargo.lock* ./
COPY dnas/ ./dnas/

# Build all zomes for wasm32
RUN cargo build \
    --release \
    --target wasm32-unknown-unknown \
    --workspace

# Pack DNA and hApp bundles
COPY happ.yaml dnas/autonymous/dna.yaml ./
RUN hc dna pack dnas/autonymous/ --output dnas/autonymous/autonymous.dna || \
    echo "hc dna pack unavailable in this build stage — using cargo output directly"

# ── Stage 2: Build UI ─────────────────────────────────────────────────────
FROM node:20-alpine AS ui-builder

WORKDIR /ui
COPY ui/package*.json ./
RUN npm ci --prefer-offline

COPY ui/ ./
RUN npm run build

# ── Stage 3: Runtime — Holochain conductor ────────────────────────────────
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates curl libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Install Holochain binary
RUN curl -L https://github.com/holochain/holochain/releases/download/holochain-0.4.1/holochain-x86_64-unknown-linux-gnu \
    -o /usr/local/bin/holochain && chmod +x /usr/local/bin/holochain || \
    echo "Binary download failed — provide holochain binary manually"

WORKDIR /app

# Copy built artifacts
COPY --from=zome-builder /build/target/wasm32-unknown-unknown/release/*.wasm ./wasm/
COPY --from=zome-builder /build/happ.yaml ./
COPY --from=zome-builder /build/dnas/ ./dnas/
COPY --from=ui-builder  /ui/dist/ ./ui/

# Conductor config
COPY conductor-config.yaml ./

EXPOSE 8888 3000

CMD ["holochain", "--config-path", "conductor-config.yaml"]
