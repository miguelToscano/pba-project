# CLI

This directory contains `stack-cli`, the Rust command-line tool for interacting with the template chain through [subxt](https://github.com/parity-tech/subxt).

## Run It

From the repo root:

```bash
cargo run -p stack-cli -- --help
```

## Command Groups

- `pallet`: `create-claim`, `revoke-claim`, `get-claim`, `list-claims`
- `chain`: `info`, `blocks`, `statement-submit`, `statement-dump`
- `prove`: all-in-one — hash a file, submit a pallet claim, optionally Statement Store / Bulletin integration

## Examples

From the repo root:

```bash
# Chain info
cargo run -p stack-cli -- chain info

# Pallet interaction
cargo run -p stack-cli -- pallet create-claim --file ./README.md
cargo run -p stack-cli -- pallet list-claims

# Statement Store
cargo run -p stack-cli -- chain statement-submit --file ./README.md --signer alice
cargo run -p stack-cli -- chain statement-dump

# Combined flow (file hash + pallet claim + optional extras)
cargo run -p stack-cli -- prove --file ./README.md --statement-store -s alice
```

## Signers

Commands accept Substrate-side dev names (`alice`, `bob`, …), mnemonic phrases, or `0x` sr25519 secret seeds.

See [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md) for broader CLI and deployment examples.
