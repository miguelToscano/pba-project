use clap::{Parser, Subcommand};

mod commands;

#[derive(Parser)]
#[command(name = "stack-cli")]
#[command(about = "CLI for interacting with the Polkadot Stack Template chain")]
struct Cli {
	/// WebSocket RPC endpoint URL
	#[arg(long, env = "SUBSTRATE_RPC_WS", default_value = "ws://127.0.0.1:9944")]
	url: String,

	#[command(subcommand)]
	command: Commands,
}

#[derive(Subcommand)]
enum Commands {
	/// Chain information commands
	Chain {
		#[command(subcommand)]
		action: commands::chain::ChainAction,
	},
	/// Proof of existence pallet commands
	Pallet {
		#[command(subcommand)]
		action: commands::pallet::PalletAction,
	},
	/// All-in-one: hash a file, create a claim, and optionally upload to Bulletin Chain /
	/// Statement Store
	Prove(commands::prove::ProveArgs),
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
	let cli = Cli::parse();

	match cli.command {
		Commands::Chain { action } => commands::chain::run(action, &cli.url).await?,
		Commands::Pallet { action } => commands::pallet::run(action, &cli.url).await?,
		Commands::Prove(args) => commands::prove::run(args, &cli.url).await?,
	}

	Ok(())
}
