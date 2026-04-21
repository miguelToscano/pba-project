//! # Template Pallet - Proof of Existence
//!
//! A proof of existence pallet that demonstrates core FRAME concepts:
//! - Per-hash storage using `StorageMap`
//! - Dispatchable calls (`create_claim`, `revoke_claim`)
//! - Events and errors
//! - Weight annotations via benchmarks
//! - Mock runtime and unit tests
//!
//! Users submit a 32-byte blake2b-256 hash (e.g. of a file) to create an on-chain
//! claim recording who submitted it and when. Only the claim owner can revoke it.
//!
//! This pallet implements the same "proof of existence" concept as the Solidity smart
//! contract templates, allowing developers to compare the three approaches side-by-side.

#![cfg_attr(not(feature = "std"), no_std)]

pub use pallet::*;

#[cfg(test)]
mod mock;

#[cfg(test)]
mod tests;

pub mod weights;

#[cfg(feature = "runtime-benchmarks")]
mod benchmarking;

#[frame::pallet]
pub mod pallet {
	use crate::weights::WeightInfo;
	use frame::prelude::*;

	#[pallet::pallet]
	pub struct Pallet<T>(_);

	/// Configuration trait for this pallet.
	#[pallet::config]
	pub trait Config: frame_system::Config {
		/// A type representing the weights required by the dispatchables of this pallet.
		type WeightInfo: WeightInfo;
	}

	/// A customer record (extensible; currently a marker type).
	#[derive(Encode, Decode, Clone, Copy, PartialEq, Eq, RuntimeDebug, TypeInfo, MaxEncodedLen)]
	pub struct Customer;

	/// One entry on a [`Restaurant`]'s menu.
	#[derive(
		Encode,
		Decode,
		DecodeWithMemTracking,
		Clone,
		PartialEq,
		Eq,
		RuntimeDebug,
		TypeInfo,
		MaxEncodedLen,
		Default,
	)]
	pub struct MenuItem {
		/// Short label for the dish (UTF-8 bytes, bounded for `MaxEncodedLen`).
		pub name: BoundedVec<u8, ConstU32<64>>,
		/// Longer description (UTF-8 bytes, bounded for `MaxEncodedLen`).
		pub description: BoundedVec<u8, ConstU32<256>>,
		/// Item price in the smallest on-chain unit (plain `u128`; not tied to a specific token here).
		pub price: u128,
	}

	/// A restaurant registered on-chain: display name and menu.
	#[derive(
		Encode,
		Decode,
		DecodeWithMemTracking,
		Clone,
		PartialEq,
		Eq,
		RuntimeDebug,
		TypeInfo,
		MaxEncodedLen,
		Default,
	)]
	pub struct Restaurant {
		/// Restaurant name (UTF-8 bytes, bounded for `MaxEncodedLen`).
		pub name: BoundedVec<u8, ConstU32<128>>,
		/// Ordered list of menu items (bounded length).
		pub menu: BoundedVec<MenuItem, ConstU32<64>>,
	}

	/// A rider record registered on-chain (extensible; currently a marker type).
	#[derive(Encode, Decode, Clone, Copy, PartialEq, Eq, RuntimeDebug, TypeInfo, MaxEncodedLen)]
	pub struct Rider;

	/// Monotonic identifier for an [`Order`].
	pub type OrderId = u64;

	/// Maximum lines (menu index + quantity pairs) in one order.
	pub type MaxOrderLines = ConstU32<32>;

	/// Maximum order ids kept per customer or per restaurant index list.
	pub type MaxOrderQueue = ConstU32<256>;

	/// Lifecycle of an order (restaurant advances until terminal).
	#[derive(
		Encode,
		Decode,
		DecodeWithMemTracking,
		Clone,
		Copy,
		PartialEq,
		Eq,
		RuntimeDebug,
		TypeInfo,
		MaxEncodedLen,
		Default,
	)]
	pub enum OrderStatus {
		/// Just placed by the customer.
		#[default]
		Created,
		/// Restaurant is preparing the order.
		InProgress,
		/// Ready for customer pickup or rider handoff.
		ReadyForPickup,
		/// Out for delivery (terminal — no further transitions).
		OnItsWay,
	}

	/// One line in an order: index into the restaurant's on-chain menu and quantity.
	#[derive(
		Encode,
		Decode,
		DecodeWithMemTracking,
		Clone,
		Copy,
		PartialEq,
		Eq,
		RuntimeDebug,
		TypeInfo,
		MaxEncodedLen,
		Default,
	)]
	pub struct OrderLine {
		/// Index into [`Restaurant::menu`] at the time of ordering.
		pub menu_index: u32,
		pub quantity: u32,
	}

	/// A customer order: who ordered, from which restaurant, lines, and status.
	#[derive(
		Encode,
		Decode,
		DecodeWithMemTracking,
		Clone,
		PartialEq,
		Eq,
		RuntimeDebug,
		TypeInfo,
		MaxEncodedLen,
	)]
	#[scale_info(skip_type_params(T))]
	pub struct Order<T: Config> {
		pub customer: T::AccountId,
		pub restaurant: T::AccountId,
		pub lines: BoundedVec<OrderLine, MaxOrderLines>,
		pub status: OrderStatus,
		/// Rider assigned to deliver the order (if claimed).
		pub assigned_rider: Option<T::AccountId>,
	}

	/// A proof-of-existence claim: who created it and when.
	#[derive(Encode, Decode, Clone, PartialEq, Eq, RuntimeDebug, TypeInfo, MaxEncodedLen)]
	#[scale_info(skip_type_params(T))]
	pub struct Claim<T: Config> {
		/// The account that created the claim.
		pub owner: T::AccountId,
		/// The block number when the claim was created.
		pub block_number: BlockNumberFor<T>,
	}

	/// Storage for proof-of-existence claims.
	/// Maps a 32-byte hash to the claim details (owner, block number).
	#[pallet::storage]
	pub type Claims<T: Config> = StorageMap<_, Blake2_128Concat, H256, Claim<T>, OptionQuery>;

	/// Registered customers: one entry per account.
	#[pallet::storage]
	pub type Customers<T: Config> =
		StorageMap<_, Blake2_128Concat, T::AccountId, Customer, OptionQuery>;

	/// Registered restaurants: one entry per operator account.
	#[pallet::storage]
	pub type Restaurants<T: Config> =
		StorageMap<_, Blake2_128Concat, T::AccountId, Restaurant, OptionQuery>;

	/// Registered riders (delivery): one entry per account.
	#[pallet::storage]
	pub type Riders<T: Config> = StorageMap<_, Blake2_128Concat, T::AccountId, Rider, OptionQuery>;

	/// Next [`OrderId`] to assign (starts at 0; first order gets id 0 then counter increments).
	#[pallet::storage]
	pub type NextOrderId<T: Config> = StorageValue<_, OrderId, ValueQuery>;

	/// All orders by id.
	#[pallet::storage]
	pub type Orders<T: Config> = StorageMap<_, Blake2_128Concat, OrderId, Order<T>, OptionQuery>;

	/// Order ids for a customer (newest appended; bounded).
	#[pallet::storage]
	pub type CustomerOrders<T: Config> = StorageMap<
		_,
		Blake2_128Concat,
		T::AccountId,
		BoundedVec<OrderId, MaxOrderQueue>,
		ValueQuery,
	>;

	/// Order ids for a restaurant (newest appended; bounded).
	#[pallet::storage]
	pub type RestaurantOrders<T: Config> = StorageMap<
		_,
		Blake2_128Concat,
		T::AccountId,
		BoundedVec<OrderId, MaxOrderQueue>,
		ValueQuery,
	>;

	/// Events emitted by this pallet.
	#[pallet::event]
	#[pallet::generate_deposit(pub(super) fn deposit_event)]
	pub enum Event<T: Config> {
		/// A new claim was created.
		ClaimCreated {
			/// The account that created the claim.
			who: T::AccountId,
			/// The hash that was claimed.
			hash: H256,
		},
		/// A claim was revoked by its owner.
		ClaimRevoked {
			/// The account that revoked the claim.
			who: T::AccountId,
			/// The hash that was revoked.
			hash: H256,
		},
		/// A new customer was registered.
		CustomerCreated {
			/// The account registered as a customer.
			who: T::AccountId,
		},
		/// A new restaurant was registered.
		RestaurantCreated {
			/// The account registered as a restaurant operator.
			who: T::AccountId,
		},
		/// A new rider was registered.
		RiderCreated {
			/// The account registered as a rider.
			who: T::AccountId,
		},
		/// A customer placed an order.
		OrderPlaced {
			order_id: OrderId,
			customer: T::AccountId,
			restaurant: T::AccountId,
		},
		/// An order's status was updated by the restaurant.
		OrderStatusChanged {
			order_id: OrderId,
			status: OrderStatus,
		},
		/// A rider claimed an order for delivery.
		OrderDeliveryClaimed {
			order_id: OrderId,
			rider: T::AccountId,
		},
	}

	/// Errors that can occur in this pallet.
	#[pallet::error]
	pub enum Error<T> {
		/// This hash has already been claimed.
		AlreadyClaimed,
		/// The caller is not the owner of this claim.
		NotClaimOwner,
		/// No claim exists for this hash.
		ClaimNotFound,
		/// This account is already registered as a customer.
		AlreadyCustomer,
		/// This account is already registered as a restaurant operator.
		AlreadyRestaurant,
		/// This account is already registered as a rider.
		AlreadyRider,
		/// Restaurant name must be non-empty.
		RestaurantNameEmpty,
		/// Caller must be registered as a customer to place an order.
		NotRegisteredCustomer,
		/// Caller must be registered as a rider to claim or start a delivery.
		NotRegisteredRider,
		/// Target account has no restaurant record.
		UnknownRestaurant,
		/// Menu index is out of range for that restaurant's menu.
		InvalidMenuIndex,
		/// Line quantity must be greater than zero.
		InvalidQuantity,
		/// Order must contain at least one line.
		EmptyOrder,
		/// No order exists for this id.
		UnknownOrder,
		/// Only the restaurant operator for this order may advance status.
		NotOrderRestaurant,
		/// Order is already in the terminal status.
		OrderAlreadyCompleted,
		/// This order is not in `ReadyForPickup`, so it cannot be claimed or started.
		OrderNotReadyForPickup,
		/// This order has already been claimed by a rider.
		OrderAlreadyClaimedByRider,
		/// Caller is not the rider assigned to this order.
		NotAssignedRider,
		/// Restaurant cannot advance an order past `ReadyForPickup`.
		OrderAwaitingRiderPickup,
		/// Customer or restaurant order list is full.
		OrderQueueFull,
	}

	/// Dispatchable calls.
	#[pallet::call]
	impl<T: Config> Pallet<T> {
		/// Create a new proof-of-existence claim for the given hash.
		///
		/// The hash must not already be claimed. The caller becomes the owner,
		/// and the current block number is recorded.
		#[pallet::call_index(0)]
		#[pallet::weight(T::WeightInfo::create_claim())]
		pub fn create_claim(origin: OriginFor<T>, hash: H256) -> DispatchResult {
			let who = ensure_signed(origin)?;
			ensure!(!Claims::<T>::contains_key(hash), Error::<T>::AlreadyClaimed);
			let block_number = frame_system::Pallet::<T>::block_number();
			Claims::<T>::insert(hash, Claim { owner: who.clone(), block_number });
			Self::deposit_event(Event::ClaimCreated { who, hash });
			Ok(())
		}

		/// Revoke an existing proof-of-existence claim.
		///
		/// Only the original claim owner can revoke it. The storage entry is removed.
		#[pallet::call_index(1)]
		#[pallet::weight(T::WeightInfo::revoke_claim())]
		pub fn revoke_claim(origin: OriginFor<T>, hash: H256) -> DispatchResult {
			let who = ensure_signed(origin)?;
			let claim = Claims::<T>::get(hash).ok_or(Error::<T>::ClaimNotFound)?;
			ensure!(claim.owner == who, Error::<T>::NotClaimOwner);
			Claims::<T>::remove(hash);
			Self::deposit_event(Event::ClaimRevoked { who, hash });
			Ok(())
		}

		/// Register the caller as a customer.
		#[pallet::call_index(2)]
		#[pallet::weight(T::WeightInfo::create_customer())]
		pub fn create_customer(origin: OriginFor<T>) -> DispatchResult {
			let who = ensure_signed(origin)?;
			ensure!(!Customers::<T>::contains_key(&who), Error::<T>::AlreadyCustomer);
			Customers::<T>::insert(&who, Customer);
			Self::deposit_event(Event::CustomerCreated { who });
			Ok(())
		}

		/// Register the caller as a restaurant operator with display name and menu.
		#[pallet::call_index(3)]
		#[pallet::weight(T::WeightInfo::create_restaurant())]
		pub fn create_restaurant(
			origin: OriginFor<T>,
			name: BoundedVec<u8, ConstU32<128>>,
			menu: BoundedVec<MenuItem, ConstU32<64>>,
		) -> DispatchResult {
			let who = ensure_signed(origin)?;
			ensure!(!Restaurants::<T>::contains_key(&who), Error::<T>::AlreadyRestaurant);
			ensure!(!name.is_empty(), Error::<T>::RestaurantNameEmpty);
			Restaurants::<T>::insert(&who, Restaurant { name, menu });
			Self::deposit_event(Event::RestaurantCreated { who });
			Ok(())
		}

		/// Register the caller as a rider.
		#[pallet::call_index(4)]
		#[pallet::weight(T::WeightInfo::create_rider())]
		pub fn create_rider(origin: OriginFor<T>) -> DispatchResult {
			let who = ensure_signed(origin)?;
			ensure!(!Riders::<T>::contains_key(&who), Error::<T>::AlreadyRider);
			Riders::<T>::insert(&who, Rider);
			Self::deposit_event(Event::RiderCreated { who });
			Ok(())
		}

		/// Place an order at `restaurant` with menu lines (indices into that restaurant's menu).
		///
		/// Caller must be a registered customer. Appends the new order id to both
		/// [`CustomerOrders`] and [`RestaurantOrders`].
		#[pallet::call_index(5)]
		#[pallet::weight(T::WeightInfo::place_order())]
		pub fn place_order(
			origin: OriginFor<T>,
			restaurant: T::AccountId,
			lines: BoundedVec<OrderLine, MaxOrderLines>,
		) -> DispatchResult {
			let who = ensure_signed(origin)?;
			ensure!(Customers::<T>::contains_key(&who), Error::<T>::NotRegisteredCustomer);
			let venue = Restaurants::<T>::get(&restaurant).ok_or(Error::<T>::UnknownRestaurant)?;
			ensure!(!lines.is_empty(), Error::<T>::EmptyOrder);
			let menu_len = venue.menu.len() as u32;
			for line in lines.iter() {
				ensure!(line.quantity > 0, Error::<T>::InvalidQuantity);
				ensure!(line.menu_index < menu_len, Error::<T>::InvalidMenuIndex);
			}

			let order_id = NextOrderId::<T>::get();
			NextOrderId::<T>::put(order_id.saturating_add(1));

			let order = Order {
				customer: who.clone(),
				restaurant: restaurant.clone(),
				lines,
				status: OrderStatus::Created,
				assigned_rider: None,
			};
			Orders::<T>::insert(order_id, order);

			CustomerOrders::<T>::try_mutate(&who, |ids| {
				ids.try_push(order_id).map_err(|_| Error::<T>::OrderQueueFull)
			})?;
			RestaurantOrders::<T>::try_mutate(&restaurant, |ids| {
				ids.try_push(order_id).map_err(|_| Error::<T>::OrderQueueFull)
			})?;

			Self::deposit_event(Event::OrderPlaced {
				order_id,
				customer: who,
				restaurant,
			});
			Ok(())
		}

		/// Advance this order to the next status (restaurant operator only). [`OrderStatus::OnItsWay`] is terminal.
		#[pallet::call_index(6)]
		#[pallet::weight(T::WeightInfo::advance_order_status())]
		pub fn advance_order_status(origin: OriginFor<T>, order_id: OrderId) -> DispatchResult {
			let who = ensure_signed(origin)?;
			let mut order = Orders::<T>::get(order_id).ok_or(Error::<T>::UnknownOrder)?;
			ensure!(order.restaurant == who, Error::<T>::NotOrderRestaurant);
			let next = match order.status {
				OrderStatus::Created => OrderStatus::InProgress,
				OrderStatus::InProgress => OrderStatus::ReadyForPickup,
				OrderStatus::ReadyForPickup => return Err(Error::<T>::OrderAwaitingRiderPickup.into()),
				OrderStatus::OnItsWay => return Err(Error::<T>::OrderAlreadyCompleted.into()),
			};
			order.status = next;
			Orders::<T>::insert(order_id, order);
			Self::deposit_event(Event::OrderStatusChanged { order_id, status: next });
			Ok(())
		}

		/// Claim an order for delivery as a rider. Only `ReadyForPickup` orders may be claimed.
		#[pallet::call_index(7)]
		#[pallet::weight(T::WeightInfo::claim_order_delivery())]
		pub fn claim_order_delivery(origin: OriginFor<T>, order_id: OrderId) -> DispatchResult {
			let who = ensure_signed(origin)?;
			ensure!(Riders::<T>::contains_key(&who), Error::<T>::NotRegisteredRider);

			let mut order = Orders::<T>::get(order_id).ok_or(Error::<T>::UnknownOrder)?;
			ensure!(order.status == OrderStatus::ReadyForPickup, Error::<T>::OrderNotReadyForPickup);
			ensure!(order.assigned_rider.is_none(), Error::<T>::OrderAlreadyClaimedByRider);

			order.assigned_rider = Some(who.clone());
			Orders::<T>::insert(order_id, order);
			Self::deposit_event(Event::OrderDeliveryClaimed { order_id, rider: who });
			Ok(())
		}

		/// Confirm pickup and start delivery as the assigned rider.
		///
		/// Moves the order to the terminal `OnItsWay` status.
		#[pallet::call_index(8)]
		#[pallet::weight(T::WeightInfo::confirm_delivery_pickup())]
		pub fn confirm_delivery_pickup(origin: OriginFor<T>, order_id: OrderId) -> DispatchResult {
			let who = ensure_signed(origin)?;
			ensure!(Riders::<T>::contains_key(&who), Error::<T>::NotRegisteredRider);

			let mut order = Orders::<T>::get(order_id).ok_or(Error::<T>::UnknownOrder)?;
			ensure!(order.status == OrderStatus::ReadyForPickup, Error::<T>::OrderNotReadyForPickup);
			ensure!(
				order.assigned_rider.as_ref() == Some(&who),
				Error::<T>::NotAssignedRider
			);

			order.status = OrderStatus::OnItsWay;
			Orders::<T>::insert(order_id, order);
			Self::deposit_event(Event::OrderStatusChanged {
				order_id,
				status: OrderStatus::OnItsWay,
			});
			Ok(())
		}
	}
}
