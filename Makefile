# Autonymous.me hApp — Makefile
# Run `make help` for all available commands

.PHONY: help setup build build-zomes pack-dna pack-happ \
        run-conductor install-app reset-conductor \
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

setup: ## Install all prerequisites (Rust wasm target + holochain CLI + node deps)
	rustup target add wasm32-unknown-unknown
	cargo install holochain_cli --locked || true
	cd ui && npm install

## ─── Build ──────────────────────────────────────────────────────────────────

build: build-zomes pack-dna pack-happ ui-build ## Full build

build-zomes: ## Compile all zomes to wasm32
	$(CARGO) build \
	  --release \
	  --target wasm32-unknown-unknown \
	  --workspace

pack-dna: build-zomes ## Pack the Autonymous DNA bundle
	$(HC) dna pack dnas/autonymous/ \
	  --output dnas/autonymous/autonymous.dna

pack-happ: pack-dna ## Pack the hApp bundle
	$(HC) app pack . \
	  --output autonymous-me.happ

## ─── Run ────────────────────────────────────────────────────────────────────

run-conductor: ## Start the Holochain conductor
	holochain --config-path conductor-config.yaml

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

test-integration: pack-happ ## Run integration tests with a real conductor
	$(HC) s generate --run tests/

## ─── Docker ─────────────────────────────────────────────────────────────────

docker-build: ## Build Docker image
	docker build -t autonymous-me:latest .

docker-run: docker-build ## Run via Docker
	docker run -p 8888:8888 -p 3000:3000 autonymous-me:latest

## ─── Utility ─────────────────────────────────────────────────────────────────

clean: ## Remove all build artifacts
	$(CARGO) clean
	rm -f dnas/autonymous/autonymous.dna autonymous-me.happ
	cd ui && rm -rf dist node_modules
