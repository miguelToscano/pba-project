use clap::Args;
use subxt::{OnlineClient, PolkadotConfig};

use super::{
	hash_input, parse_h256, resolve_statement_signer, resolve_substrate_signer,
	submit_to_statement_store, upload_to_bulletin,
};

#[derive(Args)]
pub struct ProveArgs {
	/// Path to the file to prove
	#[arg(long)]
	pub file: String,
	/// Also upload the file to the Bulletin Chain (IPFS)
	#[arg(long)]
	pub bulletin: bool,
	/// Also submit the file to the Statement Store
	#[arg(long)]
	pub statement_store: bool,
	/// Signer: dev name (alice/bob/charlie), mnemonic, or 0x secret seed
	#[arg(long, short, default_value = "alice")]
	pub signer: String,
}

pub async fn run(args: ProveArgs, ws_url: &str) -> Result<(), Box<dyn std::error::Error>> {
	let (hash_hex, file_bytes) = hash_input(None, Some(&args.file))?;
	let file_bytes = file_bytes.unwrap();

	// Optional: upload to Bulletin Chain
	if args.bulletin {
		let keypair = resolve_substrate_signer(&args.signer)?;
		upload_to_bulletin(&file_bytes, &keypair).await?;
	}

	// Optional: submit to Statement Store
	if args.statement_store {
		let statement_signer = resolve_statement_signer(&args.signer)?;
		submit_to_statement_store(ws_url, &file_bytes, &statement_signer).await?;
	}

	// Create on-chain claim via pallet
	let api = OnlineClient::<PolkadotConfig>::from_url(ws_url).await?;
	let keypair = resolve_substrate_signer(&args.signer)?;
	let hash_bytes = parse_h256(&hash_hex)?;

	let tx = subxt::dynamic::tx(
		"TemplatePallet",
		"create_claim",
		vec![("hash", subxt::dynamic::Value::from_bytes(hash_bytes))],
	);
	let result = api
		.tx()
		.sign_and_submit_then_watch_default(&tx, &keypair)
		.await?
		.wait_for_finalized_success()
		.await?;
	println!("create_claim finalized in block: {}", result.extrinsic_hash());

	Ok(())
}
