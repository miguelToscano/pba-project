//! Benchmarking setup for pallet-template

use super::*;
use frame::{deps::frame_benchmarking::v2::*, prelude::*};

#[benchmarks]
mod benchmarks {
	use super::*;
	#[cfg(test)]
	use crate::pallet::Pallet as ProofOfExistence;
	use frame_system::RawOrigin;

	#[benchmark]
	fn create_claim() {
		let caller: T::AccountId = whitelisted_caller();
		let hash = H256::repeat_byte(1);
		#[extrinsic_call]
		create_claim(RawOrigin::Signed(caller.clone()), hash);

		assert!(Claims::<T>::contains_key(&hash));
	}

	#[benchmark]
	fn revoke_claim() {
		let caller: T::AccountId = whitelisted_caller();
		let hash = H256::repeat_byte(1);
		Claims::<T>::insert(
			&hash,
			Claim {
				owner: caller.clone(),
				block_number: frame_system::Pallet::<T>::block_number(),
			},
		);
		#[extrinsic_call]
		revoke_claim(RawOrigin::Signed(caller.clone()), hash);

		assert!(!Claims::<T>::contains_key(&hash));
	}

	#[benchmark]
	fn create_customer() {
		let caller: T::AccountId = whitelisted_caller();
		#[extrinsic_call]
		create_customer(RawOrigin::Signed(caller.clone()));

		assert!(Customers::<T>::contains_key(&caller));
	}

	#[benchmark]
	fn create_restaurant() {
		let caller: T::AccountId = whitelisted_caller();
		let name = BoundedVec::<u8, ConstU32<128>>::try_from(b"Benchmark Bistro".to_vec()).unwrap();
		let menu = BoundedVec::<MenuItem, ConstU32<64>>::default();
		#[extrinsic_call]
		create_restaurant(RawOrigin::Signed(caller.clone()), name, menu);

		assert!(Restaurants::<T>::contains_key(&caller));
	}

	#[benchmark]
	fn create_rider() {
		let caller: T::AccountId = whitelisted_caller();
		#[extrinsic_call]
		create_rider(RawOrigin::Signed(caller.clone()));

		assert!(Riders::<T>::contains_key(&caller));
	}

	impl_benchmark_test_suite!(ProofOfExistence, crate::mock::new_test_ext(), crate::mock::Test);
}
