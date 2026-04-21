# Polkadot Stack Tools

This document describes all the parts of the Polkadot technology stack exposed by this template.

## Required vs Optional

- **Required for the smallest local demo**: Rust, `polkadot-omni-node`, the runtime, and the pallet.
- **Optional JSON-RPC tooling**: `eth-rpc` runs alongside the node if you attach standard Ethereum clients to `pallet-revive`.
- **Required for the web app**: add `web/` plus the committed PAPI descriptors in `web/.papi/`.
- **Optional extras**: Bulletin Chain (IPFS uploads), Spektr host integration, and DotNS deployment. These are isolated so students can remove them without touching the core PoE flows.

## Polkadot SDK

The foundation for the entire blockchain layer. Polkadot SDK provides FRAME (the pallet development framework), Cumulus (parachain support), and all the runtime primitives.

- **Version**: stable2512-3 (umbrella crate v2512.3.3)
- **Used for**: Parachain runtime, pallet development, consensus, XCM
- **Source**: [`blockchain/runtime/`](../blockchain/runtime/), [`blockchain/pallets/template/`](../blockchain/pallets/template/)
- **Docs**: [paritytech.github.io/polkadot-sdk](https://paritytech.github.io/polkadot-sdk/master/)

The runtime includes core pallets (System, Balances, Aura, Session, Sudo, XCM) plus `pallet-revive` for smart contracts and the custom `TemplatePallet` for proof of existence.

## Statement Store

Statement Store is an omni-node feature for validating, storing, and gossiping signed statements over the network using a runtime-provided `validate_statement` API.

- **Used for**: Short-lived off-chain statement storage and propagation
- **Runtime pieces**: `pallet-statement` + `sp-statement-store` runtime API
- **Node flag**: `--enable-statement-store`
- **RPC methods**: `statement_submit`, `statement_dump`, plus the topic/key query variants
- **Local status in this template**: Available in the repo's relay-backed Zombienet scripts; unavailable in omni-node dev mode on stable2512-3

The full-feature local scripts generate a local relay-chain-backed spec and then start a Zombienet network (2 relay validators + 1 collator) using the active `STACK_PORT_OFFSET` / `STACK_*_PORT` settings. They wait until `statement_submit` appears in `rpc_methods`, so the Statement Store RPCs are actually present before the scripted stack continues.

The lighter solo-node tools (`start-dev.sh` and Docker Compose) use omni-node dev mode for a faster iteration loop. On `polkadot-sdk stable2512-3`, that dev path does not wire up Statement Store even if `--enable-statement-store` is passed.

The current template integration is active in the web app:

- Frontend: optional Statement Store submission from the pallet page (when the node exposes Statement Store RPCs)

## pallet-revive (EVM + PVM)

Enables EVM and PolkaVM smart contract execution on the parachain. This repository focuses on the FRAME pallet path; Solidity tooling is not vendored here.

- **Version**: v0.12.2 (via runtime dependency)
- **RPC**: `eth-rpc` bridges Ethereum JSON-RPC to pallet-revive when running the full stack scripts
- **Docs**: [Polkadot smart contracts](https://docs.polkadot.com/smart-contracts/overview/)

### Conceptual layout

```
Solidity / PolkaVM contracts (your project)
  → Ethereum JSON-RPC
  → eth-rpc adapter (default: http://127.0.0.1:8545 when using the scripts)
  → pallet-revive on the parachain
```

Standard Ethereum tooling applies when you attach your own contracts to `eth-rpc`; this repo does not ship Solidity sources.

## Bulletin Chain (IPFS Storage)

The Polkadot Bulletin Chain is a system chain that provides on-chain data storage with IPFS integration. Files stored via the `TransactionStorage` pallet are automatically available through IPFS protocols (Bitswap, DHT) and gateways.

- **Pallet**: `TransactionStorage.store()` for uploading, `TransactionStorage.renew()` for extending retention
- **Hash**: blake2b-256 (same hash used for PoE claims)
- **CID**: CID v1 with raw codec (0x55) and blake2b-256 multihash (0xb220)
- **Paseo RPC**: `wss://paseo-bulletin-rpc.polkadot.io`
- **IPFS Gateway**: `https://paseo-ipfs.polkadot.io/ipfs/{cid}`
- **Authorization**: Required before uploading. On Bulletin Paseo, open [paritytech.github.io/polkadot-bulletin-chain](https://paritytech.github.io/polkadot-bulletin-chain/), go to `Faucet` -> `Authorize Account`, and request the transaction count and byte allowance you need for the Substrate account that will upload the file. The testing faucet grants a temporary allowance using the Alice dev account via sudo.
- **Data expiry**: ~7 days (100,800 blocks) unless renewed
- **Max file size**: 8 MiB per transaction
- **Used for**: Optional IPFS upload of files before claiming their hash on-chain
- **Source**: [`web/src/hooks/useBulletin.ts`](../web/src/hooks/useBulletin.ts)

Authorization on Bulletin Paseo is temporary. The allowance expires at a block roughly 100,000 blocks in the future, and the same UI exposes `Renew` if you need more time. If upload fails with an authorization error, first check that you authorized the same Substrate address that is signing `TransactionStorage.store()`.

This self-service faucet flow is specific to the current Bulletin Paseo/testing setup. Other Bulletin deployments may use a different authorization process.

### Upload flow

1. Frontend computes blake2b-256 hash of the file
2. (Optional) Upload file bytes to Bulletin Chain via `TransactionStorage.store()`
3. Claim the hash on the parachain pallet
4. The IPFS link is reconstructed from the hash — resolves if the file was uploaded

## DotNS (Polkadot Naming System)

DotNS provides `.dot` domain names that resolve to IPFS content, enabling human-readable URLs for dApps deployed on IPFS.

- **Used for**: Frontend deployment to IPFS with a `.dot` domain
- **CI Workflow**: `.github/workflows/deploy-frontend.yml` uses `paritytech/dotns-sdk`
- **Domain registration**: Automatic via `register-base: true` in the workflow
- **Mode**: Manual workflow dispatch with an explicit `DOTNS_MNEMONIC` secret
- **Docs**: [dotns.app](https://dotns.app)

### Deployment

The GitHub Actions workflow builds the frontend, uploads to IPFS, and registers/updates the DotNS domain when you manually trigger it. The local script (`scripts/deploy-frontend.sh`) uploads to IPFS via the `w3` CLI and then prints the DotNS follow-up steps.

## PAPI (Polkadot API)

The JavaScript/TypeScript library for interacting with Substrate chains. PAPI provides type-safe extrinsic submission, storage queries, and runtime API calls using descriptors generated from chain metadata.

- **Version**: v1.23.3
- **Used for**: Frontend pallet interaction (create/revoke claims, query storage, block subscription)
- **Descriptors**: Stored in `web/.papi/`, regenerated from a running chain via `npm run update-types`
- **Source**: [`web/src/hooks/useChain.ts`](../web/src/hooks/useChain.ts), [`web/src/hooks/useConnection.ts`](../web/src/hooks/useConnection.ts)
- **Docs**: [papi.how](https://papi.how/)

### Key patterns

```typescript
import { signAndSubmitAwaitBestBlock } from "../web/src/utils/signAndSubmitBestBlock";

// Connect
const client = createClient(withPolkadotSdkCompat(getWsProvider(wsUrl)));
const api = client.getTypedApi(stack_template);

// Query storage
const entries = await api.query.TemplatePallet.Claims.getEntries();

// Submit extrinsic (best-block inclusion; faster than `tx.signAndSubmit`, which waits for finality)
const result = await signAndSubmitAwaitBestBlock(
  api.tx.TemplatePallet.create_claim({ hash: Binary.fromHex(fileHash) }),
  signer,
);
```

Also used for Bulletin Chain interaction via a separate client with the `bulletin` descriptor. The repo now fails fast if `papi generate` fails, which makes descriptor drift easier for students and AI agents to diagnose.

## Code Formatting & Linting

Consistent formatting across all languages.

| Tool | Scope | Config |
|---|---|---|
| `rustfmt` (nightly) | Rust (`blockchain/`) | `rustfmt.toml` — matches polkadot-sdk style |
| ESLint | TypeScript/React (web/) | `web/eslint.config.js` — typescript-eslint + react-hooks |
| Prettier | TypeScript (web/) | `.prettierrc` (root) |

```bash
cargo +nightly fmt && cargo clippy --workspace   # Rust
cd web && npm run lint && npm run fmt             # Frontend
```

## Polkadot Product SDK (Spektr)

The Nova Sama Technologies SDK for building products that run inside the Polkadot Triangle ecosystem (Desktop, Mobile, Web hosts). Enables Spektr wallet injection for accounts managed by the Polkadot app.

- **Package**: `@novasamatech/product-sdk`
- **Used for**: Spektr account detection and injection on the Accounts page
- **Source**: [`web/src/pages/AccountsPage.tsx`](../web/src/pages/AccountsPage.tsx)

This integration is optional. If you do not need host-injected wallets, you can remove the Accounts page without affecting the pallet demos.

### Host detection

```typescript
// Three-way environment detection
if ((window as any).__HOST_WEBVIEW_MARK__) → 'desktop-webview'
else if (window !== window.top) → 'web-iframe'
else → 'standalone'

// Spektr injection (host mode only)
await injectSpektrExtension();
const ext = await connectInjectedExtension(SpektrExtensionName);
```

## polkadot-omni-node

The unified Substrate parachain node binary. Runs the compiled runtime WASM without requiring a custom node binary.

- **Version**: v1.21.3 (stable2512-3)
- **Used for**: Running the local dev chain
- **Download**: [polkadot-sdk releases](https://github.com/paritytech/polkadot-sdk/releases/tag/polkadot-stable2512-3)

## eth-rpc

The Ethereum JSON-RPC adapter for pallet-revive. Translates standard Ethereum RPC calls (eth_call, eth_sendTransaction, etc.) into Substrate extrinsics.

- **Version**: v0.12.0
- **Used for**: Bridging standard Ethereum JSON-RPC clients to pallet-revive when you run contract workloads against the node
- **Endpoint**: `http://127.0.0.1:8545` by default for local dev, or `https://services.polkadothub-rpc.com/testnet` (Polkadot Hub TestNet)
- **Download**: [polkadot-sdk releases](https://github.com/paritytech/polkadot-sdk/releases/tag/polkadot-stable2512-3)

## Zombienet

Multi-node testing framework for Polkadot/Cumulus networks. Spawns a local relay chain + parachain network for integration testing.

- **Config**: [`blockchain/zombienet.toml`](../blockchain/zombienet.toml) (2 relay validators + 1 collator)
- **Docs**: [github.com/parity-tech/zombienet](https://github.com/paritytech/zombienet)

## Blockscout

Block explorer for the Polkadot TestNet. Used for contract verification and transaction inspection.

- **TestNet URL**: [blockscout-testnet.polkadot.io](https://blockscout-testnet.polkadot.io/)
- **Used for**: Contract verification via `npx hardhat verify`
