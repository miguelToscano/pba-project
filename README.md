# Polkadot Stack Template

A developer starter template demonstrating the Polkadot stack through a **Proof of Existence** system — claim file hashes on-chain via a Substrate FRAME pallet. Drop a file, claim its hash on-chain, and optionally upload it to IPFS via the Bulletin Chain.

Students do not need to use every optional integration in this repo. The runtime, pallet, frontend, Bulletin integration, Spektr integration, and deployment workflows are intentionally separated so teams can keep only what they want.

## What's Inside

- **Polkadot SDK Blockchain** ([`blockchain/`](blockchain/)) — A Cumulus-based parachain compatible with `polkadot-omni-node`
  - **Substrate Pallet** ([`blockchain/pallets/template/`](blockchain/pallets/template/)) — FRAME pallet for creating and revoking Proof of Existence claims on-chain
  - **Parachain Runtime** ([`blockchain/runtime/`](blockchain/runtime/)) — Runtime wiring for the pallet and supporting infrastructure (`pallet-revive`, etc.)
- **Frontend** ([`web/`](web/)) — React + TypeScript app using PAPI for pallet interactions
- **Dev Scripts** ([`scripts/`](scripts/)) — One-command scripts to build, start, and test the stack locally

## Quick Start

### Docker (no Rust required)

```bash
# Start the parachain node + Ethereum RPC adapter (first build compiles the runtime ~10-20 min)
docker compose up -d

# Start the frontend on the host
(cd web && npm install && npm run dev)
# Frontend: http://127.0.0.1:5173
```

Only Node.js is needed on the host for the frontend. The Docker build compiles the Rust runtime and generates the chain spec automatically. See [`web/README.md`](web/README.md) for frontend-specific notes.

### Prerequisites (native)

- **OpenSSL** development headers (`libssl-dev` on Ubuntu, `openssl` on macOS)
- **protoc** Protocol Buffers compiler (`protobuf-compiler` on Ubuntu, `protobuf` on macOS)
- **Rust** (stable, installed via [rustup](https://rustup.rs/))
- **Node.js** 22.x LTS (`22.5+` recommended) and npm v10.9.0+
- **Polkadot SDK binaries** (stable2512-3): `polkadot`, `polkadot-prepare-worker`, `polkadot-execute-worker` (relay), `polkadot-omni-node`, `eth-rpc`, `chain-spec-builder`, and `zombienet`. Fetch them all into `./bin/` (gitignored) with:

  ```bash
  ./scripts/download-sdk-binaries.sh
  ```

  This is the primary supported native setup for this repo. The stack scripts (`start-all.sh`, `start-local.sh`, etc.) run the same step automatically unless you set `STACK_DOWNLOAD_SDK_BINARIES=0`. Versions match the **Key Versions** table below.

If your platform cannot use the downloader-managed binaries, see the limited-support fallback in [docs/INSTALL.md](docs/INSTALL.md#manual-binary-fallback-limited-support).

The repo includes [`.nvmrc`](.nvmrc) and `engines` fields in the JavaScript projects to keep everyone on the same Node major version.

### Run locally

```bash
# Start relay-backed stack, eth-rpc, and frontend in one command
./scripts/start-all.sh
# Substrate RPC: ws://127.0.0.1:9944
# Ethereum RPC:  http://127.0.0.1:8545
# Frontend:      http://127.0.0.1:5173
```

`start-all.sh` is the recommended full-feature local path when you want the Statement Store example with a relay-backed network (`polkadot-sdk stable2512-3`).

For the solo-node loop, relay-backed network without the full scripted loop, frontend-only startup, port overrides, or a second local stack, see [`scripts/README.md`](scripts/README.md).

For component-specific next steps:

- [`web/README.md`](web/README.md)

### Lint & format

```bash
# Rust (requires nightly for rustfmt config options)
cargo +nightly fmt              # format
cargo +nightly fmt --check      # check only
cargo clippy --workspace        # lint

# Frontend (web/)
cd web && npm run fmt           # format
cd web && npm run fmt:check     # check only
cd web && npm run lint          # eslint
```

### Run tests

```bash
# Pallet unit tests
cargo test -p pallet-template

# All tests including benchmarks
SKIP_PALLET_REVIVE_FIXTURES=1 cargo test --workspace --features runtime-benchmarks

# Statement Store runtime coverage
cargo test -p stack-template-runtime
```

## Documentation

- [docs/TOOLS.md](docs/TOOLS.md) - Polkadot stack components referenced by this template
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) - Deployment guide (GitHub Pages, DotNS, runtime)
- [docs/INSTALL.md](docs/INSTALL.md) - Detailed setup instructions

## Using Only What You Need

- **Pallet + runtime**: [`blockchain/pallets/template/`](blockchain/pallets/template/), [`blockchain/runtime/`](blockchain/runtime/)
- **Frontend**: Core PoE UI lives in [`web/src/pages/PalletPage.tsx`](web/src/pages/PalletPage.tsx). The Accounts page, Spektr support, and Bulletin upload hooks are optional extras.
- **Optional integrations**: Bulletin Chain, Spektr, DotNS — see [docs/TOOLS.md](docs/TOOLS.md).

## Key Versions

| Component | Version |
|---|---|
| polkadot-sdk | stable2512-3 (umbrella crate v2512.3.3) |
| polkadot | v1.21.3 (relay chain binary) |
| polkadot-omni-node | v1.21.3 (from stable2512-3 release) |
| eth-rpc | v0.12.0 (Ethereum JSON-RPC adapter) |
| chain-spec-builder | v16.0.0 |
| zombienet | v1.3.133 |
| pallet-revive | v0.12.2 |
| Node.js | 22.x LTS |
| PAPI | v1.23.3 |
| React | v18.3 |

## Resources

- [Polkadot SDK Documentation](https://paritytech.github.io/polkadot-sdk/master/)
- [PAPI Documentation](https://papi.how/)
- [Polkadot Faucet](https://faucet.polkadot.io/) (TestNet tokens)
- [Bulletin Chain Authorization](https://paritytech.github.io/polkadot-bulletin-chain/)

## License

[MIT](LICENSE)
