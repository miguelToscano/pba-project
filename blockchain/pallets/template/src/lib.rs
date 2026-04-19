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

	/// A restaurant record registered on-chain (extensible; currently a marker type).
	#[derive(Encode, Decode, Clone, Copy, PartialEq, Eq, RuntimeDebug, TypeInfo, MaxEncodedLen)]
	pub struct Restaurant;

	/// A rider record registered on-chain (extensible; currently a marker type).
	#[derive(Encode, Decode, Clone, Copy, PartialEq, Eq, RuntimeDebug, TypeInfo, MaxEncodedLen)]
	pub struct Rider;

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
	pub type Customers<T: Config> = StorageMap<_, Blake2_128Concat, T::AccountId, Customer, OptionQuery>;

	/// Registered restaurants: one entry per operator account.
	#[pallet::storage]
	pub type Restaurants<T: Config> = StorageMap<_, Blake2_128Concat, T::AccountId, Restaurant, OptionQuery>;

	/// Registered riders (delivery): one entry per account.
	#[pallet::storage]
	pub type Riders<T: Config> = StorageMap<_, Blake2_128Concat, T::AccountId, Rider, OptionQuery>;

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

		/// Register the caller as a restaurant operator.
		#[pallet::call_index(3)]
		#[pallet::weight(T::WeightInfo::create_restaurant())]
		pub fn create_restaurant(origin: OriginFor<T>) -> DispatchResult {
			let who = ensure_signed(origin)?;
			ensure!(!Restaurants::<T>::contains_key(&who), Error::<T>::AlreadyRestaurant);
			Restaurants::<T>::insert(&who, Restaurant);
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
	}
}
