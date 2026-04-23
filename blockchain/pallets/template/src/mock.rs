use frame::{
	deps::{
		frame_support::{
			derive_impl,
			traits::{ConstU128, VariantCountOf},
			weights::constants::RocksDbWeight,
			PalletId,
		},
		frame_system::GenesisConfig,
	},
	prelude::*,
	runtime::prelude::*,
	testing_prelude::*,
};

pub type AccountId = u64;
pub type Balance = u128;

pub const INITIAL_BALANCE: Balance = 10_000;
pub const DELIVERY_FEE: Balance = 500;

#[frame_construct_runtime]
mod test_runtime {
	#[runtime::runtime]
	#[runtime::derive(
		RuntimeCall,
		RuntimeEvent,
		RuntimeError,
		RuntimeOrigin,
		RuntimeFreezeReason,
		RuntimeHoldReason,
		RuntimeSlashReason,
		RuntimeLockId,
		RuntimeTask,
		RuntimeViewFunction
	)]
	pub struct Test;

	#[runtime::pallet_index(0)]
	pub type System = frame_system;
	#[runtime::pallet_index(1)]
	pub type Balances = pallet_balances;
	#[runtime::pallet_index(2)]
	pub type ProofOfExistence = crate;
}

#[derive_impl(frame_system::config_preludes::TestDefaultConfig)]
impl frame_system::Config for Test {
	type Nonce = u64;
	type Block = MockBlock<Test>;
	type BlockHashCount = ConstU64<250>;
	type DbWeight = RocksDbWeight;
	type AccountId = AccountId;
	type Lookup = sp_runtime::traits::IdentityLookup<AccountId>;
	type AccountData = pallet_balances::AccountData<Balance>;
}

#[derive_impl(pallet_balances::config_preludes::TestDefaultConfig)]
impl pallet_balances::Config for Test {
	type Balance = Balance;
	type ExistentialDeposit = ConstU128<1>;
	type AccountStore = System;
	type MaxFreezes = VariantCountOf<RuntimeFreezeReason>;
}

parameter_types! {
	pub const TemplatePalletId: PalletId = PalletId(*b"py/tmplt");
}

impl crate::Config for Test {
	type WeightInfo = ();
	type NativeBalance = Balances;
	type PalletId = TemplatePalletId;
	type DeliveryFee = ConstU128<DELIVERY_FEE>;
}

/// Build genesis storage according to the mock runtime.
///
/// All canonical test accounts (ids `1..=10` plus the pallet-owned account) are endowed
/// with [`INITIAL_BALANCE`], so that any `place_order` invocation has enough balance to
/// pay the item total plus the delivery fee and stay above the existential deposit.
pub fn new_test_ext() -> TestState {
	let mut storage = GenesisConfig::<Test>::default().build_storage().unwrap();
	pallet_balances::GenesisConfig::<Test> {
		balances: (1u64..=10).map(|id| (id, INITIAL_BALANCE)).collect(),
		..Default::default()
	}
	.assimilate_storage(&mut storage)
	.unwrap();
	storage.into()
}
