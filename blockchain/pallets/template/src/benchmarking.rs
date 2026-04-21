//! Benchmarking setup for pallet-template

use super::*;
use frame::{
	deps::frame_benchmarking::{account, v2::*},
	prelude::*,
	testing_prelude::assert_ok,
};

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

	#[benchmark]
	fn place_order() {
		let customer: T::AccountId = account("customer", 0, 0);
		let restaurant: T::AccountId = account("restaurant", 0, 0);
		let name = BoundedVec::<u8, ConstU32<128>>::try_from(b"Bench Cafe".to_vec()).unwrap();
		let item = MenuItem {
			name: BoundedVec::try_from(b"Dish".to_vec()).unwrap(),
			description: BoundedVec::default(),
			price: 1,
		};
		let menu = BoundedVec::<MenuItem, ConstU32<64>>::try_from(vec![item]).unwrap();
		Customers::<T>::insert(&customer, Customer);
		Restaurants::<T>::insert(&restaurant, Restaurant { name, menu });
		let lines = BoundedVec::<OrderLine, MaxOrderLines>::try_from(vec![OrderLine {
			menu_index: 0,
			quantity: 1,
		}])
		.unwrap();
		#[extrinsic_call]
		place_order(RawOrigin::Signed(customer.clone()), restaurant.clone(), lines, H256::zero());

		assert!(Orders::<T>::contains_key(0u64));
	}

	#[benchmark]
	fn advance_order_status() {
		let customer: T::AccountId = account("customer", 0, 1);
		let restaurant: T::AccountId = account("restaurant", 0, 1);
		let name = BoundedVec::<u8, ConstU32<128>>::try_from(b"Bench Cafe".to_vec()).unwrap();
		let item = MenuItem {
			name: BoundedVec::try_from(b"Dish".to_vec()).unwrap(),
			description: BoundedVec::default(),
			price: 1,
		};
		let menu = BoundedVec::<MenuItem, ConstU32<64>>::try_from(vec![item]).unwrap();
		Customers::<T>::insert(&customer, Customer);
		Restaurants::<T>::insert(&restaurant, Restaurant { name, menu });
		let lines = BoundedVec::<OrderLine, MaxOrderLines>::try_from(vec![OrderLine {
			menu_index: 0,
			quantity: 1,
		}])
		.unwrap();
		assert_ok!(Pallet::<T>::place_order(
			RawOrigin::Signed(customer).into(),
			restaurant.clone(),
			lines,
			H256::zero(),
		));
		#[extrinsic_call]
		advance_order_status(RawOrigin::Signed(restaurant.clone()), 0u64);

		assert_eq!(Orders::<T>::get(0u64).expect("order").status, OrderStatus::InProgress);
	}

	#[benchmark]
	fn claim_order_delivery() {
		let customer: T::AccountId = account("customer", 0, 2);
		let restaurant: T::AccountId = account("restaurant", 0, 2);
		let rider: T::AccountId = account("rider", 0, 2);
		let name = BoundedVec::<u8, ConstU32<128>>::try_from(b"Bench Cafe".to_vec()).unwrap();
		let item = MenuItem {
			name: BoundedVec::try_from(b"Dish".to_vec()).unwrap(),
			description: BoundedVec::default(),
			price: 1,
		};
		let menu = BoundedVec::<MenuItem, ConstU32<64>>::try_from(vec![item]).unwrap();
		Customers::<T>::insert(&customer, Customer);
		Restaurants::<T>::insert(&restaurant, Restaurant { name, menu });
		Riders::<T>::insert(&rider, Rider);
		let lines = BoundedVec::<OrderLine, MaxOrderLines>::try_from(vec![OrderLine {
			menu_index: 0,
			quantity: 1,
		}])
		.unwrap();
		assert_ok!(Pallet::<T>::place_order(
			RawOrigin::Signed(customer).into(),
			restaurant.clone(),
			lines,
			H256::zero(),
		));
		assert_ok!(Pallet::<T>::advance_order_status(
			RawOrigin::Signed(restaurant.clone()).into(),
			0u64,
		));
		assert_ok!(Pallet::<T>::advance_order_status(RawOrigin::Signed(restaurant).into(), 0u64,));

		#[extrinsic_call]
		claim_order_delivery(RawOrigin::Signed(rider.clone()), 0u64);

		assert_eq!(Orders::<T>::get(0u64).expect("order").assigned_rider, Some(rider));
	}

	#[benchmark]
	fn confirm_delivery_pickup() {
		let customer: T::AccountId = account("customer", 0, 3);
		let restaurant: T::AccountId = account("restaurant", 0, 3);
		let rider: T::AccountId = account("rider", 0, 3);
		let name = BoundedVec::<u8, ConstU32<128>>::try_from(b"Bench Cafe".to_vec()).unwrap();
		let item = MenuItem {
			name: BoundedVec::try_from(b"Dish".to_vec()).unwrap(),
			description: BoundedVec::default(),
			price: 1,
		};
		let menu = BoundedVec::<MenuItem, ConstU32<64>>::try_from(vec![item]).unwrap();
		Customers::<T>::insert(&customer, Customer);
		Restaurants::<T>::insert(&restaurant, Restaurant { name, menu });
		Riders::<T>::insert(&rider, Rider);
		let lines = BoundedVec::<OrderLine, MaxOrderLines>::try_from(vec![OrderLine {
			menu_index: 0,
			quantity: 1,
		}])
		.unwrap();
		assert_ok!(Pallet::<T>::place_order(
			RawOrigin::Signed(customer).into(),
			restaurant.clone(),
			lines,
			H256::zero(),
		));
		assert_ok!(Pallet::<T>::advance_order_status(
			RawOrigin::Signed(restaurant.clone()).into(),
			0u64,
		));
		assert_ok!(Pallet::<T>::advance_order_status(RawOrigin::Signed(restaurant).into(), 0u64,));
		assert_ok!(Pallet::<T>::claim_order_delivery(
			RawOrigin::Signed(rider.clone()).into(),
			0u64,
		));

		#[extrinsic_call]
		confirm_delivery_pickup(RawOrigin::Signed(rider.clone()), 0u64);

		assert_eq!(Orders::<T>::get(0u64).expect("order").status, OrderStatus::OnItsWay);
	}

	impl_benchmark_test_suite!(ProofOfExistence, crate::mock::new_test_ext(), crate::mock::Test);
}
