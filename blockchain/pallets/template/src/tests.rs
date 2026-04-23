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
		// Caller is a registered restaurant, so the error path returns
		// `Pays::No` — use `assert_err_ignore_postinfo!` to match only the
		// `DispatchError` kind.
		assert_err_ignore_postinfo!(
			ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0),
			Error::<Test>::OrderAwaitingRiderPickup,
		);
		assert_ok!(ProofOfExistence::create_rider(RuntimeOrigin::signed(3)));
		assert_ok!(ProofOfExistence::claim_order_delivery(RuntimeOrigin::signed(3), 0));
		assert_ok!(ProofOfExistence::confirm_delivery_pickup(RuntimeOrigin::signed(3), 0));
		assert_eq!(Orders::<Test>::get(0).unwrap().status, OrderStatus::OnItsWay);
		assert_err_ignore_postinfo!(
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
	// A *registered* restaurant that isn't the one for this order must still
	// be blocked with `NotOrderRestaurant`. We register account 3 as a second
	// restaurant so the fee waiver gate passes for them; the authorisation
	// must then reject them on order ownership. The error is `Pays::No`
	// (they're a registered restaurant), hence `assert_err_ignore_postinfo!`.
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue2 = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu2 = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue2, menu2));
		let venue3 = BoundedVec::try_from(b"Diner".to_vec()).unwrap();
		let menu3 = BoundedVec::try_from(vec![sample_menu_item(b"B")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(3), venue3, menu3));
		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 1 }]).unwrap();
		assert_ok!(ProofOfExistence::place_order(RuntimeOrigin::signed(1), 2, lines, test_hash(4)));
		assert_err_ignore_postinfo!(
			ProofOfExistence::advance_order_status(RuntimeOrigin::signed(3), 0),
			Error::<Test>::NotOrderRestaurant,
		);
	});
}

#[test]
fn advance_order_status_rejects_non_restaurant_caller() {
	// A caller that never registered as a restaurant is rejected up-front
	// with `NotRegisteredRestaurant` and still pays the normal fee (default
	// post-info with `Pays::Yes`). Using plain `assert_noop!` is fine here.
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 1 }]).unwrap();
		assert_ok!(ProofOfExistence::place_order(
			RuntimeOrigin::signed(1),
			2,
			lines,
			test_hash(41),
		));
		assert_noop!(
			ProofOfExistence::advance_order_status(RuntimeOrigin::signed(9), 0),
			Error::<Test>::NotRegisteredRestaurant,
		);
	});
}

// -- finish_order_delivery --------------------------------------------------
//
// Helper: drive an order all the way to `OnItsWay` with the given PIN, ready
// to be finished. Returns `(hashed_pin, pin_bytes)`. Customer is account 1,
// restaurant is 2, rider is 3; the restaurant has exactly one menu item at
// price 100.
fn make_order_on_its_way(pin: &[u8]) -> H256 {
	use frame::deps::sp_core::hashing::blake2_256;
	let hashed_pin = H256::from(blake2_256(pin));
	assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
	let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
	let menu = BoundedVec::try_from(vec![sample_menu_item(b"Burger")]).unwrap();
	assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
	assert_ok!(ProofOfExistence::create_rider(RuntimeOrigin::signed(3)));
	let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 2 }]).unwrap();
	assert_ok!(ProofOfExistence::place_order(RuntimeOrigin::signed(1), 2, lines, hashed_pin));
	assert_ok!(ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0));
	assert_ok!(ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0));
	assert_ok!(ProofOfExistence::claim_order_delivery(RuntimeOrigin::signed(3), 0));
	assert_ok!(ProofOfExistence::confirm_delivery_pickup(RuntimeOrigin::signed(3), 0));
	assert_eq!(Orders::<Test>::get(0).unwrap().status, OrderStatus::OnItsWay);
	hashed_pin
}

fn pin_bv(pin: &[u8]) -> BoundedVec<u8, crate::MaxDeliveryPinLen> {
	BoundedVec::try_from(pin.to_vec()).unwrap()
}

#[test]
fn finish_order_delivery_happy_path_transfers_and_completes() {
	new_test_ext().execute_with(|| {
		System::set_block_number(1);
		let _ = make_order_on_its_way(b"1234");

		let pallet_account = ProofOfExistence::account_id();
		let pallet_before = BalancesPallet::<Test>::free_balance(&pallet_account);
		let restaurant_before = BalancesPallet::<Test>::free_balance(2);
		let rider_before = BalancesPallet::<Test>::free_balance(3);

		assert_ok!(ProofOfExistence::finish_order_delivery(
			RuntimeOrigin::signed(3),
			0,
			pin_bv(b"1234"),
		));

		// Status is terminal and the held funds were split.
		assert_eq!(Orders::<Test>::get(0).unwrap().status, OrderStatus::Completed);
		let price = 200u128;
		assert_eq!(
			BalancesPallet::<Test>::free_balance(&pallet_account),
			pallet_before - price - DELIVERY_FEE,
		);
		assert_eq!(BalancesPallet::<Test>::free_balance(2), restaurant_before + price);
		assert_eq!(BalancesPallet::<Test>::free_balance(3), rider_before + DELIVERY_FEE);

		System::assert_has_event(
			crate::Event::OrderCompleted {
				order_id: 0,
				restaurant: 2,
				rider: 3,
				restaurant_amount: price,
				rider_amount: DELIVERY_FEE,
			}
			.into(),
		);
		System::assert_has_event(
			crate::Event::OrderStatusChanged { order_id: 0, status: OrderStatus::Completed }.into(),
		);
	});
}

#[test]
fn finish_order_delivery_rejects_wrong_pin() {
	new_test_ext().execute_with(|| {
		let _ = make_order_on_its_way(b"1234");

		let pallet_account = ProofOfExistence::account_id();
		let pallet_before = BalancesPallet::<Test>::free_balance(&pallet_account);

		// Rider errors out with `Pays::No`, so we use `assert_err_ignore_postinfo!`
		// (which only compares the `DispatchError` portion). State-noop is
		// covered by the storage/balance asserts that follow.
		assert_err_ignore_postinfo!(
			ProofOfExistence::finish_order_delivery(RuntimeOrigin::signed(3), 0, pin_bv(b"9999"),),
			Error::<Test>::InvalidDeliveryPin,
		);
		assert_eq!(Orders::<Test>::get(0).unwrap().status, OrderStatus::OnItsWay);
		// No funds moved on the failed attempt.
		assert_eq!(BalancesPallet::<Test>::free_balance(&pallet_account), pallet_before);
	});
}

#[test]
fn finish_order_delivery_only_assigned_rider() {
	new_test_ext().execute_with(|| {
		let _ = make_order_on_its_way(b"1234");
		assert_ok!(ProofOfExistence::create_rider(RuntimeOrigin::signed(4)));
		// Caller is a registered rider so the error post-info carries
		// `Pays::No`; use `assert_err_ignore_postinfo!` to only assert the
		// `DispatchError` kind.
		assert_err_ignore_postinfo!(
			ProofOfExistence::finish_order_delivery(RuntimeOrigin::signed(4), 0, pin_bv(b"1234"),),
			Error::<Test>::NotAssignedRider,
		);
	});
}

#[test]
fn finish_order_delivery_requires_on_its_way() {
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"Burger")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
		assert_ok!(ProofOfExistence::create_rider(RuntimeOrigin::signed(3)));
		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 1 }]).unwrap();
		assert_ok!(ProofOfExistence::place_order(
			RuntimeOrigin::signed(1),
			2,
			lines,
			test_hash(77),
		));
		// Still `Created`: not even assigned, much less `OnItsWay`.
		assert_err_ignore_postinfo!(
			ProofOfExistence::finish_order_delivery(RuntimeOrigin::signed(3), 0, pin_bv(b"1234"),),
			Error::<Test>::OrderNotOnItsWay,
		);
	});
}

#[test]
fn finish_order_delivery_rejects_double_complete() {
	new_test_ext().execute_with(|| {
		let _ = make_order_on_its_way(b"1234");
		assert_ok!(ProofOfExistence::finish_order_delivery(
			RuntimeOrigin::signed(3),
			0,
			pin_bv(b"1234"),
		));
		// Second attempt must fail: status is now `Completed`, not `OnItsWay`.
		assert_err_ignore_postinfo!(
			ProofOfExistence::finish_order_delivery(RuntimeOrigin::signed(3), 0, pin_bv(b"1234"),),
			Error::<Test>::OrderNotOnItsWay,
		);
	});
}

#[test]
fn finish_order_delivery_is_free_for_rider() {
	// Fee policy: registered riders pay no transaction fee for
	// `finish_order_delivery`, on both the success path and on any error
	// path taken after the rider-registration gate. A non-rider caller
	// short-circuits on `NotRegisteredRider` *before* the waiver, and
	// therefore pays the normal fee (`Pays::Yes`).
	new_test_ext().execute_with(|| {
		let _ = make_order_on_its_way(b"1234");

		// Success: rider pays no fee.
		let ok_info =
			ProofOfExistence::finish_order_delivery(RuntimeOrigin::signed(3), 0, pin_bv(b"1234"))
				.expect("happy path finishes delivery");
		assert_eq!(ok_info.pays_fee, Pays::No);
	});

	new_test_ext().execute_with(|| {
		// Wrong-PIN attempt by the registered rider: still free.
		let _ = make_order_on_its_way(b"1234");
		let err =
			ProofOfExistence::finish_order_delivery(RuntimeOrigin::signed(3), 0, pin_bv(b"9999"))
				.expect_err("wrong PIN must fail");
		assert_eq!(err.post_info.pays_fee, Pays::No);
	});

	new_test_ext().execute_with(|| {
		// Non-rider caller is rejected up-front and pays the normal fee —
		// `ensure!` on `NotRegisteredRider` returns a plain `DispatchError`,
		// which converts to `PostDispatchInfo { pays_fee: Yes, .. }`.
		let _ = make_order_on_its_way(b"1234");
		let err =
			ProofOfExistence::finish_order_delivery(RuntimeOrigin::signed(99), 0, pin_bv(b"1234"))
				.expect_err("non-rider must fail");
		assert_eq!(err.post_info.pays_fee, Pays::Yes);
	});
}

#[test]
fn advance_order_status_rejects_after_completed() {
	new_test_ext().execute_with(|| {
		let _ = make_order_on_its_way(b"1234");
		assert_ok!(ProofOfExistence::finish_order_delivery(
			RuntimeOrigin::signed(3),
			0,
			pin_bv(b"1234"),
		));
		// Restaurant 2 is registered, so the error is tagged `Pays::No`.
		assert_err_ignore_postinfo!(
			ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0),
			Error::<Test>::OrderAlreadyCompleted,
		);
	});
}

#[test]
fn advance_order_status_is_free_for_restaurant() {
	// Success path: the restaurant pays no fee for pushing an order through
	// its kitchen states.
	new_test_ext().execute_with(|| {
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 1 }]).unwrap();
		assert_ok!(ProofOfExistence::place_order(
			RuntimeOrigin::signed(1),
			2,
			lines,
			test_hash(51),
		));
		let ok_info = ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0)
			.expect("restaurant can advance its own order");
		assert_eq!(ok_info.pays_fee, Pays::No);
	});

	// Error path for a registered restaurant: `Pays::No` still holds (e.g.
	// trying to advance an unknown order).
	new_test_ext().execute_with(|| {
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
		let err = ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 42)
			.expect_err("no order 42");
		assert_eq!(err.post_info.pays_fee, Pays::No);
	});

	// Non-restaurant caller: fee is charged (DoS resistance).
	new_test_ext().execute_with(|| {
		let err = ProofOfExistence::advance_order_status(RuntimeOrigin::signed(9), 0)
			.expect_err("non-restaurant must fail");
		assert_eq!(err.post_info.pays_fee, Pays::Yes);
	});
}

#[test]
fn claim_order_delivery_is_free_for_rider() {
	new_test_ext().execute_with(|| {
		// Success: registered rider claims a `ReadyForPickup` order.
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 1 }]).unwrap();
		assert_ok!(ProofOfExistence::place_order(
			RuntimeOrigin::signed(1),
			2,
			lines,
			test_hash(52),
		));
		assert_ok!(ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0));
		assert_ok!(ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0));
		assert_ok!(ProofOfExistence::create_rider(RuntimeOrigin::signed(3)));
		let ok_info = ProofOfExistence::claim_order_delivery(RuntimeOrigin::signed(3), 0)
			.expect("rider claims ready-for-pickup order");
		assert_eq!(ok_info.pays_fee, Pays::No);
	});

	new_test_ext().execute_with(|| {
		// Error path for a registered rider stays free.
		assert_ok!(ProofOfExistence::create_rider(RuntimeOrigin::signed(3)));
		let err = ProofOfExistence::claim_order_delivery(RuntimeOrigin::signed(3), 42)
			.expect_err("no order 42");
		assert_eq!(err.post_info.pays_fee, Pays::No);
	});

	new_test_ext().execute_with(|| {
		// Non-rider caller pays the normal fee.
		let err = ProofOfExistence::claim_order_delivery(RuntimeOrigin::signed(9), 0)
			.expect_err("non-rider must fail");
		assert_eq!(err.post_info.pays_fee, Pays::Yes);
	});
}

#[test]
fn confirm_delivery_pickup_is_free_for_rider() {
	new_test_ext().execute_with(|| {
		// Success path: assigned rider confirms pickup on their claimed order.
		assert_ok!(ProofOfExistence::create_customer(RuntimeOrigin::signed(1)));
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		assert_ok!(ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu));
		let lines = BoundedVec::try_from(vec![OrderLine { menu_index: 0, quantity: 1 }]).unwrap();
		assert_ok!(ProofOfExistence::place_order(
			RuntimeOrigin::signed(1),
			2,
			lines,
			test_hash(53),
		));
		assert_ok!(ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0));
		assert_ok!(ProofOfExistence::advance_order_status(RuntimeOrigin::signed(2), 0));
		assert_ok!(ProofOfExistence::create_rider(RuntimeOrigin::signed(3)));
		assert_ok!(ProofOfExistence::claim_order_delivery(RuntimeOrigin::signed(3), 0));
		let ok_info = ProofOfExistence::confirm_delivery_pickup(RuntimeOrigin::signed(3), 0)
			.expect("assigned rider confirms pickup");
		assert_eq!(ok_info.pays_fee, Pays::No);
	});

	new_test_ext().execute_with(|| {
		// A registered rider that isn't the assigned one still pays no fee.
		let _ = make_order_on_its_way(b"1234"); // rider 3 is assigned, order is `OnItsWay`.
		assert_ok!(ProofOfExistence::create_rider(RuntimeOrigin::signed(4)));
		let err = ProofOfExistence::confirm_delivery_pickup(RuntimeOrigin::signed(4), 0)
			.expect_err("rider 4 is not assigned");
		assert_eq!(err.post_info.pays_fee, Pays::No);
	});

	new_test_ext().execute_with(|| {
		// Non-rider caller pays the normal fee.
		let err = ProofOfExistence::confirm_delivery_pickup(RuntimeOrigin::signed(9), 0)
			.expect_err("non-rider must fail");
		assert_eq!(err.post_info.pays_fee, Pays::Yes);
	});
}

#[test]
fn create_customer_is_free_on_success_but_charges_on_duplicate() {
	// Fee policy: the first successful `create_customer` is free so any funded
	// account can onboard. A duplicate registration must pay the normal fee so
	// an attacker can't cheaply probe the extrinsic in a loop.
	new_test_ext().execute_with(|| {
		let ok_info = ProofOfExistence::create_customer(RuntimeOrigin::signed(1))
			.expect("fresh registration succeeds");
		assert_eq!(ok_info.pays_fee, Pays::No);

		let err = ProofOfExistence::create_customer(RuntimeOrigin::signed(1))
			.expect_err("duplicate registration fails");
		assert_eq!(err.post_info.pays_fee, Pays::Yes);
	});

	// Bad origin (unsigned) also pays the normal fee.
	new_test_ext().execute_with(|| {
		let err = ProofOfExistence::create_customer(RuntimeOrigin::none())
			.expect_err("unsigned call is rejected");
		assert_eq!(err.post_info.pays_fee, Pays::Yes);
	});
}

#[test]
fn create_restaurant_is_free_on_success_but_charges_on_error() {
	new_test_ext().execute_with(|| {
		let venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		let ok_info =
			ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), venue, menu.clone())
				.expect("fresh registration succeeds");
		assert_eq!(ok_info.pays_fee, Pays::No);

		// Duplicate: still pays the fee.
		let dup_venue = BoundedVec::try_from(b"Cafe".to_vec()).unwrap();
		let err = ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), dup_venue, menu)
			.expect_err("duplicate restaurant");
		assert_eq!(err.post_info.pays_fee, Pays::Yes);
	});

	// Empty name is rejected up-front with the normal fee.
	new_test_ext().execute_with(|| {
		let empty: BoundedVec<u8, ConstU32<128>> = BoundedVec::default();
		let menu = BoundedVec::try_from(vec![sample_menu_item(b"A")]).unwrap();
		let err = ProofOfExistence::create_restaurant(RuntimeOrigin::signed(2), empty, menu)
			.expect_err("empty name rejected");
		assert_eq!(err.post_info.pays_fee, Pays::Yes);
	});
}

#[test]
fn create_rider_is_free_on_success_but_charges_on_duplicate() {
	new_test_ext().execute_with(|| {
		let ok_info = ProofOfExistence::create_rider(RuntimeOrigin::signed(3))
			.expect("fresh registration succeeds");
		assert_eq!(ok_info.pays_fee, Pays::No);

		let err = ProofOfExistence::create_rider(RuntimeOrigin::signed(3))
			.expect_err("duplicate registration fails");
		assert_eq!(err.post_info.pays_fee, Pays::Yes);
	});

	new_test_ext().execute_with(|| {
		let err = ProofOfExistence::create_rider(RuntimeOrigin::none())
			.expect_err("unsigned call is rejected");
		assert_eq!(err.post_info.pays_fee, Pays::Yes);
	});
}
