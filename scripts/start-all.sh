#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
source "$SCRIPT_DIR/common.sh"

ETH_RPC_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo "Shutting down..."
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
        wait "$FRONTEND_PID" 2>/dev/null || true
    fi
    if [ -n "$ETH_RPC_PID" ]; then
        kill "$ETH_RPC_PID" 2>/dev/null || true
        wait "$ETH_RPC_PID" 2>/dev/null || true
    fi
    cleanup_zombienet
}
trap cleanup EXIT INT TERM

echo "=== Polkadot Stack Template - Full Local Stack ==="
echo ""
echo "  This is the recommended one-command path."
echo "  It uses Zombienet (relay chain + parachain) so all examples work,"
echo "  including Statement Store."
echo ""

echo "[1/8] Building runtime..."
build_runtime

echo "[2/8] Generating chain spec..."
generate_chain_spec

echo "[3/8] Compiling contracts..."
cd "$ROOT_DIR/contracts/evm" && npm install --silent && npx hardhat compile
cd "$ROOT_DIR/contracts/pvm" && npm install --silent && npx hardhat compile
cd "$ROOT_DIR"

echo "[4/8] Starting Zombienet (relay chain + parachain)..."
echo "  This takes longer than dev mode because the relay chain must finalize"
echo "  and the parachain must register before the collator starts authoring."
start_zombienet_background
wait_for_substrate_rpc

echo "[5/8] Starting eth-rpc adapter..."
start_eth_rpc_background
wait_for_eth_rpc

echo "[6/8] Deploying contracts..."
echo "  Deploying ProofOfExistence via EVM (solc)..."
cd "$ROOT_DIR/contracts/evm"
npm run deploy:local

echo "  Deploying ProofOfExistence via PVM (resolc)..."
cd "$ROOT_DIR/contracts/pvm"
npm run deploy:local

cd "$ROOT_DIR"

echo "[7/8] Building CLI..."
cargo build -p stack-cli --release

echo "[8/8] Starting frontend..."
cd "$ROOT_DIR/web"
npm install

if curl -s -o /dev/null http://127.0.0.1:9944 2>/dev/null; then
    echo "  Updating PAPI descriptors..."
    npm run update-types
    npm run codegen
fi

npm run dev &
FRONTEND_PID=$!
echo "  Frontend starting (http://localhost:5173)"

cd "$ROOT_DIR"

echo ""
echo "=== Full local stack running ==="
echo "  Substrate RPC:    ws://127.0.0.1:9944"
echo "  Ethereum RPC:     http://127.0.0.1:8545"
echo "  Frontend:         http://localhost:5173"
echo "  Zombienet dir:    $ZOMBIE_DIR"
echo ""
echo "  Included examples:"
echo "    - PoE Pallet"
echo "    - PoE EVM Contract"
echo "    - PoE PVM Contract"
echo "    - Statement Store"
echo "    - Bulletin Chain upload"
echo ""
echo "Press Ctrl+C to stop all."
wait "$ZOMBIE_PID"
