# CLAUDE.md

This file provides context for AI agents working with this repository.

## Project Purpose

A developer starter template for the **Polkadot Blockchain Academy** demonstrating the Polkadot stack through a **Proof of Existence** system — claim and revoke ownership of file hashes on-chain via a Substrate FRAME pallet, with a React frontend and Rust CLI.

Students do not need to use every optional integration. Components are intentionally separated so teams can trim what they do not need.

## Component Map

| Component | Path | Tech |
|---|---|---|
| FRAME Pallet | `blockchain/pallets/template/` | Rust, FRAME, polkadot-sdk |
| Parachain Runtime | `blockchain/runtime/` | Rust, Cumulus, pallet-revive (optional for `eth-rpc`) |
| Frontend | `web/` | React 18, Vite, TypeScript, Tailwind, PAPI |
| CLI | `cli/` | Rust, subxt, clap |
| Scripts | `scripts/` | Bash (start, deploy, test helpers) |

## How the Layers Connect

- The **pallet** is wired into the runtime at `pallet_index(50)` as `TemplatePallet`.
- **pallet-revive** (index 90) remains in the runtime for Ethereum-compatible execution; the checked-in frontend and CLI focus on the **pallet** path.
- The **frontend** talks to the pallet via **PAPI** over WebSocket.
- The **CLI** uses **subxt** for Substrate RPC and pallet calls.
- The local dev chain ID is `420420421`. The Polkadot Hub TestNet chain ID is `420420417`.

## Key Files

- `blockchain/pallets/template/src/lib.rs` — Pallet logic (create_claim, revoke_claim)
- `blockchain/runtime/src/lib.rs` — Runtime definition, pallet wiring, runtime APIs
- `blockchain/runtime/src/configs/mod.rs` — All pallet configuration (System, Balances, Revive, etc.)
- `blockchain/runtime/src/configs/xcm_config.rs` — XCM cross-chain messaging config
- `web/src/pages/PalletPage.tsx` — Pallet PoE frontend page
- `cli/src/commands/pallet.rs` — CLI pallet interaction commands
- `cli/src/commands/prove.rs` — All-in-one prove command (hash + claim + optional extras)
- `cli/src/commands/chain.rs` — CLI chain info, block subscription, Statement Store RPC
- `scripts/common.sh` — Shared script utilities (port config, env setup)
- `docs/INSTALL.md`, `docs/TOOLS.md`, `docs/DEPLOYMENT.md` — Setup, tooling, and deployment guides

## Build Commands

```bash
# Rust (runtime + pallet + CLI)
cargo build --release

# Frontend
cd web && npm ci && npm run build
```

## Test Commands

```bash
# Pallet unit tests
cargo test -p pallet-template

# All Rust tests (runtime + pallet + CLI)
SKIP_PALLET_REVIVE_FIXTURES=1 cargo test --workspace --features runtime-benchmarks
```

## Format & Lint

```bash
# Rust (requires nightly for rustfmt config options)
cargo +nightly fmt              # format
cargo +nightly fmt --check      # check only
cargo clippy --workspace        # lint

# Frontend
cd web && npm run fmt           # format
cd web && npm run fmt:check     # check only
cd web && npm run lint          # eslint
```

## Docker

```bash
docker compose up -d    # builds runtime in Docker, starts node + eth-rpc
docker compose down -v  # tear down
```

- `docker/Dockerfile.node` — multi-stage: compiles runtime WASM, generates chain spec, packages into polkadot-omni-node image
- `docker/Dockerfile.eth-rpc` — downloads pre-built eth-rpc binary from polkadot-sdk GH release (no official Docker image exists)
- `docker-compose.yml` (root) — full stack: node (port 9944) + eth-rpc (port 8545)
- `blockchain/Dockerfile` — lightweight deployment image (requires pre-generated chain_spec.json)
- `.dockerignore` — excludes web/, target/, node_modules/ from build context

## Running Locally

```bash
# Full stack: relay chain + collator + Statement Store + frontend (see script for details)
./scripts/start-all.sh

# Lightweight solo-node dev loop (no Statement Store)
./scripts/start-dev.sh

# Local node + eth-rpc (no relay chain)
./scripts/start-local.sh

# Frontend only (for an already-running chain)
./scripts/start-frontend.sh

# Deploy frontend
./scripts/deploy-frontend.sh

# Statement Store smoke test
./scripts/test-statement-store-smoke.sh
```

## Version Pinning

- **polkadot-sdk**: stable2512-3 (umbrella crate v2512.3.3)
- **Rust**: stable (pinned via `rust-toolchain.toml`)
- **Node.js**: 22.x LTS (pinned via `.nvmrc`)

## Notes for AI Agents

- `web/.papi/` contains checked-in PAPI descriptors so the frontend works out of the box. After modifying pallet storage or calls, regenerate with: `cd web && npx papi update && npx papi`
- `blockchain/chain_spec.json` is in `.gitignore` — it is generated at build/start time by scripts.
- The `Cargo.toml` patch for `pallet-revive-proc-macro` works around a compilation bug in stable2512-3.

## Known Gaps / Future Work

- **Runtime integration tests**: `blockchain/runtime/src/tests.rs` has only 1 compile-time API assertion test. Consider adding genesis-build smoke tests and pallet-integration tests.
- **Shell script linting**: `scripts/` has ~1180 lines of bash with no linting in CI. A workflow running `shellcheck scripts/*.sh` would catch issues.
- **E2E tests in CI**: `scripts/test-zombienet.sh` exists for local verification but is too heavy for CI (~15-25 min, requires Zombienet + binaries). Run locally before releases.
- **Docker eth-rpc image**: No official `parity/eth-rpc` Docker image exists. `docker/Dockerfile.eth-rpc` downloads the binary from GH releases as a workaround.
- **Commit message conventions**: Consider adopting Conventional Commits for clearer changelog generation.
