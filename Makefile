# Autonymous.me hApp — Makefile (Holochain 0.6)
# Run `make help` for all available commands

.PHONY: help setup build build-zomes copy-coordinator-wasms pack-dna pack-happ pack-webhapp \
        run-conductor install-app reset-conductor sandbox \
        ui-dev ui-build \
        test test-unit test-integration \
        clean docker-build docker-run

SHELL := /bin/bash
CARGO := cargo
HC    := hc
NODE  := node

## ─── Setup ─────────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}'

setup: ## Install prerequisites (Rust wasm target + Node deps; use `nix develop` for the Holochain toolchain)
	rustup target add wasm32-unknown-unknown
	npm install

## ─── Build ──────────────────────────────────────────────────────────────────

build: build-zomes pack-dna pack-happ ui-build ## Full build (zomes, DNA, hApp, UI)

build-zomes: ## Compile all zomes to wasm32 (0.6: getrandom custom backend)
	RUSTFLAGS='--cfg getrandom_backend="custom"' $(CARGO) build \
	  --release \
	  --target wasm32-unknown-unknown \
	  --workspace

copy-coordinator-wasms: ## Copy zome wasms to the distinct coordinator paths required by dna.yaml
	$(NODE) scripts/copy-coordinator-wasms.mjs

pack-dna: build-zomes copy-coordinator-wasms ## Pack the canonical DNA bundle (dnas/core)
	$(HC) dna pack dnas/core/ \
	  --output dnas/core/core.dna

pack-happ: pack-dna ## Pack the hApp bundle
	$(HC) app pack . \
	  --output autonymous-me.happ

pack-webhapp: pack-happ ui-build ## Pack the web hApp (hApp + UI) for Holochain runtimes
	cd ui && zip -r dist.zip dist
	$(HC) web-app pack . \
	  --output autonymous-me.webhapp

## ─── Run ────────────────────────────────────────────────────────────────────

run-conductor: ## Start the Holochain conductor (persistent config)
	holochain --config-path conductor-config.yaml

sandbox: pack-happ ## Generate & run a local sandbox conductor with the hApp installed
	$(HC) sandbox generate --in-process-lair --run=9000 --app-id autonomous_me autonymous-me.happ

install-app: pack-happ ## Install the hApp into a running conductor
	$(HC) app install autonymous-me.happ

reset-conductor: ## Wipe conductor state (start fresh)
	rm -rf conductor-data/

## ─── UI ─────────────────────────────────────────────────────────────────────

ui-dev: ## Start the UI dev server (Vite)
	cd ui && npm run dev

ui-build: ## Build the UI for production
	cd ui && npm run build

## ─── Tests ──────────────────────────────────────────────────────────────────

test: test-unit ## Run all tests

test-unit: ## Run Rust unit tests (no conductor)
	$(CARGO) test --workspace

test-integration: pack-happ ## Generate a sandbox and run conductor-level integration checks
	$(HC) sandbox generate --in-process-lair --run=0 --app-id autonomous_me autonymous-me.happ

## ─── Docker ─────────────────────────────────────────────────────────────────

docker-build: ## Build Docker image
	docker build -t autonymous-me:latest .

docker-run: docker-build ## Run via Docker
	docker run -p 8888:8888 -p 9000:9000 autonymous-me:latest

## ─── Utility ─────────────────────────────────────────────────────────────────

clean: ## Remove all build artifacts
	$(CARGO) clean
	rm -f dnas/core/core.dna autonymous-me.happ autonymous-me.webhapp ui/dist.zip
	cd ui && rm -rf dist node_modules
