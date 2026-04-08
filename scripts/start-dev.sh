#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

echo "=== Polkadot Stack Template - Local Development ==="
echo ""

# Build the runtime
echo "[1/3] Building runtime..."
build_runtime

# Create the chain spec using the newly built WASM
echo "[2/3] Generating chain spec..."
generate_chain_spec

echo "  Chain spec written to blockchain/chain_spec.json"

# Start the local node
echo "[3/3] Starting local omni-node..."
echo "  RPC endpoint: ws://127.0.0.1:9944"
echo ""
echo "  This is the lightweight solo-node path for pallet/runtime work."
echo "  Statement Store is not available here on stable2512-3."
echo "  Use start-all.sh for the full stack, or start-local.sh for just the relay-backed network."
echo ""
run_local_node_foreground
