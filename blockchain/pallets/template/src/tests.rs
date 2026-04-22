use crate::{
	mock::*, pallet::Error, Claims, CustomerOrders, Customers, MenuItem, NextOrderId, OrderLine,
	OrderStatus, Orders, RestaurantOrders, Riders,
};
use frame::testing_prelude::*;
use pallet_balances::Pallet as BalancesPallet;

fn test_hash(n: u64) -> H256 {
	H256::from_low_u64_be(n)
}

#[test]
fn create_claim_works() {
	new_test_ext().execute_with(|| {
		let hash = test_hash(1);
		assert_ok!(ProofOfExistence::create_claim(RuntimeOrigin::signed(1), hash));
		assert!(Claims::<Test>::contains_key(hash));
		let claim = Claims::<Test>::get(hash).unwrap();
		assert_eq!(claim.owner, 1);
	});
}

#[test]
fn create_claim_records_block_number() {
	new_test_ext().execute_with(|| {
		System::set_block_number(5);
		let hash = test_hash(1);
		assert_ok!(ProofOfExistence::create_claim(RuntimeOrigin::signed(1), hash));
		let claim = Claims::<Test>::get(hash).unwrap();
		assert_eq!(claim.block_number, 5);
	});
}

#[test]
fn create_claim_emits_event() {
	new_test_ext().execute_with(|| {
		System::set_block_number(1);
		let hash = test_hash(1);
		assert_ok!(ProofOfExistence::create_claim(RuntimeOrigin::signed(1), hash));
		System::assert_last_event(crate::Event::ClaimCreated { who: 1, hash }.into());
	});
}

#[test]
fn create_claim_fails_if_already_claimed() {
	new_test_ext().execute_with(|| {
		let hash = test_hash(1);
		assert_ok!(ProofOfExistence::create_claim(RuntimeOrigin::signed(1), hash));
		assert_noop!(
			ProofOfExistence::create_claim(RuntimeOrigin::signed(2), hash),
			Error::<Test>::AlreadyClaimed,
		);
	});
}

#[test]
fn revoke_claim_works() {
	new_test_ext().execute_with(|| {
		let hash = test_hash(1);
		assert_ok!(ProofOfExistence::create_claim(RuntimeOrigin::signed(1), hash));
		assert_ok!(ProofOfExistence::revoke_claim(RuntimeOrigin::signed(1), hash));
		assert!(!Claims::<Test>::contains_key(hash));
	});
}

#[test]
fn revoke_claim_emits_event() {
	new_test_ext().execute_with(|| {
		System::set_block_number(1);
		let hash = test_hash(1);
		assert_ok!(ProofOfExistence::create_claim(RuntimeOrigin::signed(1), hash));
		assert_ok!(ProofOfExistence::revoke_claim(RuntimeOrigin::signed(1), hash));
		System::assert_last_event(crate::Event::ClaimRevoked { who: 1, hash }.into());
	});
}

#[test]
fn revoke_claim_fails_if_not_owner() {
	new_test_ext().execute_with(|| {
		let hash = test_hash(1);
		assert_ok!(ProofOfExistence::create_claim(RuntimeOrigin::signed(1), hash));
		assert_noop!(
			ProofOfExistence::revoke_claim(RuntimeOrigin::signed(2), hash),
			Error::<Test>::NotClaimOwner,
		);
	});
}

#[test]
fn revoke_claim_fails_if_not_found() {
	new_test_ext().execute_with(|| {
		let hash = test_hash(99);
		assert_noop!(
			ProofOfExistence::revoke_claim(RuntimeOrigin::signed(1), hash),
			Error::<Test>::ClaimNotFound,
		);
	});
}

#[test]
fn unsigned_origin_is_rejected() {
	new_test_ext().execute_with(|| {
		let hash = test_hash(1);
		assert_noop!(
			ProofOfExistence::create_claim(RuntimeOrigin::none(), hash),
			DispatchError::BadOrigin,
		);
		assert_noop!(
			ProofOfExistence::revoke_claim(RuntimeOrigin::none(), hash),
			DispatchError::BadOrigin,
		);
		assert_noop!(
			ProofOfExistence::create_customer(RuntimeOrigin::none()),
			DispatchError::BadOrigin,
		);
		// assert_noop!(
		// 	ProofOfExistence::create_restaurant(RuntimeOrigin::none()),
		// 	DispatchError::BadOrigin,
		// );
		assert_noop!(
			ProofOfExistence::create_rider(RuntimeOrigin::none()),
			DispatchError::BadOrigin,
		);
	});
}

#[test]
fn create_customer_works() {
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		assert!(Customers::<Test>::contains_key(1));
	});
}

#[test]
fn create_customer_fails_if_duplicate() {
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		assert_noop!(
			ProofOfExistence::create_customer(RuntimeOrigin::signed(1)),
			Error::<Test>::AlreadyCustomer,
		);
	});
}

// #[test]
// fn create_restaurant_works() {
// 	new_test_ext().execute_with(|| {
// 		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2)));
// 		assert!(Restaurants::<Test>::contains_key(2));
// 	});
// }
// #[test]
// fn create_restaurant_emits_event() {
// 	new_test_ext().execute_with(|| {
// 		System::set_block_number(1);
// 		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(3)));
// 		System::assert_last_event(crate::Event::RestaurantCreated { who: 3 }.into());
// 	});
// }
// #[test]
// fn create_restaurant_fails_if_duplicate() {
// 	new_test_ext().execute_with(|| {
// 		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(1)));
// 		assert_noop!(
// 			ProofOfExistence::create_restaurant(RuntimeOrigin::signed(1)),
// 			Error::<Test>::AlreadyRestaurant,
// 		);
// 	});
// }
#[test]
fn create_rider_works() {
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_rider(RuntimeOrigin::signed(4)));
		assert!(Riders::<Test>::contains_key(4));
	});
}

#[test]
fn create_rider_emits_event() {
	new_test_ext().execute_with(|| {
		System::set_block_number(1);
		assert_ok!(ProofOfExistence::create_rider(RuntimeOrigin::signed(5)));
		System::assert_last_event(crate::Event::RiderCreated { who: 5 }.into());
	});
}

#[test]
fn create_rider_fails_if_duplicate() {
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_rider(RuntimeOrigin::signed(1)));
		assert_noop!(
			ProofOfExistence::create_rider(RuntimeOrigin::signed(1)),
			Error::<Test>::AlreadyRider,
		);
	});
}

fn sample_menu_item(label: &[u8]) -> MenuItem {
	MenuItem {
		name: BoundedVec::try_from(label.to_vec()).unwrap(),
		description: BoundedVec::try_from(Vec::new()).unwrap(),
		price: 100,
	}
}

#[test]
fn place_order_works_and_indexes() {
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"Burger")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 2 }]).unwrap();
		let hashed_pin = test_hash(7);
		assert_ok!(ProofOfExistence::place_order(RuntimeOrigin::signed(1), 2, lines, hashed_pin));
		assert_eq!(NextOrderId::<Test>::get(), 1);
		let order = Orders::<Test>::get(0).unwrap();
		assert_eq!(order.customer, 1);
		assert_eq!(order.restaurant, 2);
		assert_eq!(order.status, OrderStatus::Created);
		assert_eq!(order.hashed_pin, hashed_pin);
		// price = 100 (menu item) * 2 (quantity); delivery_fee = mock `DELIVERY_FEE`.
		assert_eq!(order.price, 200);
		assert_eq!(order.delivery_fee, DELIVERY_FEE);
		assert_eq!(CustomerOrders::<Test>::get(1).as_slice(), &[0u64]);
		assert_eq!(RestaurantOrders::<Test>::get(2).as_slice(), &[0u64]);
	});
}

#[test]
fn place_order_debits_customer_into_pallet_account() {
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"Burger")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));

		let pallet_account = ProofOfExistence::account_id();
		let customer_before = BalancesPallet::<Test>::free_balance(1);
		let pallet_before = BalancesPallet::<Test>::free_balance(&pallet_account);

		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 2 }]).unwrap();
		assert_ok!(ProofOfExistence::place_order(
			RuntimeOrigin::signed(1),
			2,
			lines,
			test_hash(11),
		));

		let total = 200u128 + DELIVERY_FEE;
		assert_eq!(BalancesPallet::<Test>::free_balance(1), customer_before - total);
		assert_eq!(BalancesPallet::<Test>::free_balance(&pallet_account), pallet_before + total);
	});
}

#[test]
fn place_order_emits_paid_event() {
	new_test_ext().execute_with(|| {
		System::set_block_number(1);
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"Burger")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));

		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 3 }]).unwrap();
		assert_ok!(ProofOfExistence::place_order(
			RuntimeOrigin::signed(1),
			2,
			lines,
			test_hash(12),
		));

		let total = 300u128 + DELIVERY_FEE;
		System::assert_has_event(
			crate::Event::OrderPaid { order_id: 0, customer: 1, amount: total }.into(),
		);
	});
}

#[test]
fn place_order_fails_when_customer_cannot_pay() {
	new_test_ext().execute_with(|| {
		// Account id 99 has no funds in the mock genesis (only 1..=10 are endowed).
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(99)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"Burger")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));

		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 1 }]).unwrap();
		// `transfer` with an insufficient source surfaces a `TokenError` dispatch error,
		// which is specifically what we want to assert isn't swallowed by the pallet.
		assert!(ProofOfExistence::place_order(RuntimeOrigin::signed(99), 2, lines, test_hash(13))
			.is_err());
		assert!(Orders::<Test>::get(0).is_none());
	});
}

#[test]
fn advance_order_status_sequential_until_terminal() {
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 1 }]).unwrap();
		let hashed_pin = test_hash(9);
		assert_ok!(ProofOfExistence::place_order(RuntimeOrigin::signed(1), 2, lines, hashed_pin));

		assert_ok!(ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0));
		assert_eq!(Orders::<Test>::get(0).unwrap().status, OrderStatus::InProgress);
		assert_ok!(ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0));
		assert_eq!(Orders::<Test>::get(0).unwrap().status, OrderStatus::ReadyForPickup);
		assert_noop!(
			ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0),
			Error::<Test>::OrderAwaitingRiderPickup,
		);
		assert_ok!(ProofOfExistence::create_rider(RuntimeOrigin::signed(3)));
		assert_ok!(ProofOfExistence::claim_order_delivery(RuntimeOrigin::signed(3), 0));
		assert_ok!(ProofOfExistence::confirm_delivery_pickup(RuntimeOrigin::signed(3), 0));
		assert_eq!(Orders::<Test>::get(0).unwrap().status, OrderStatus::OnItsWay);
		assert_noop!(
			ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0),
			Error::<Test>::OrderAlreadyCompleted,
		);
	});
}

#[test]
fn place_order_requires_customer() {
	new_test_ext().execute_with(|| {
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 1 }]).unwrap();
		assert_noop!(
			ProofOfExistence::place_order(RuntimeOrigin::signed(1), 2, lines, test_hash(1)),
			Error::<Test>::NotRegisteredCustomer,
		);
	});
}

#[test]
fn place_order_rejects_bad_menu_index() {
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 5, quantity: 1 }]).unwrap();
		assert_noop!(
			ProofOfExistence::place_order(RuntimeOrigin::signed(1), 2, lines, test_hash(2)),
			Error::<Test>::InvalidMenuIndex,
		);
	});
}

#[test]
fn place_order_rejects_empty_lines() {
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
		let lines = BoundedVec::default();
		assert_noop!(
			ProofOfExistence::place_order(RuntimeOrigin::signed(1), 2, lines, test_hash(3)),
			Error::<Test>::EmptyOrder,
		);
	});
}

#[test]
fn advance_order_status_wrong_restaurant() {
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 1 }]).unwrap();
		assert_ok!(ProofOfExistence::place_order(RuntimeOrigin::signed(1), 2, lines, test_hash(4)));
		assert_noop!(
			ProofOfExistence::advance_order_status(RuntimeOrigin::signed(3), 0),
			Error::<Test>::NotOrderRestaurant,
		);
	});
}
