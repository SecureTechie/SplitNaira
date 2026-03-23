#![no_std]

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, String, Symbol, Vec};

mod errors;
mod events;
#[cfg(test)]
mod tests;

use errors::SplitError;
use events::SplitEvents;

// ============================================================
//  DATA TYPES
// ============================================================

/// Represents a single collaborator in a royalty split.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Collaborator {
    /// Stellar wallet address of the collaborator
    pub address: Address,
    /// Human-readable alias (e.g. "Burna B.")
    pub alias: String,
    /// Percentage share in basis points (e.g. 5000 = 50.00%)
    /// Using basis points avoids floating point entirely.
    pub basis_points: u32,
}

/// Full metadata for a royalty split project.
#[contracttype]
#[derive(Clone, Debug)]
pub struct SplitProject {
    /// Unique project identifier
    pub project_id: Symbol,
    /// Human-readable project title
    pub title: String,
    /// Project type: "music", "film", "art", "podcast", "book", "other"
    pub project_type: String,
    /// Token contract address (XLM or USDC)
    pub token: Address,
    /// The project creator / admin address
    pub owner: Address,
    /// All collaborators and their splits
    pub collaborators: Vec<Collaborator>,
    /// Whether the split is locked (immutable after locking)
    pub locked: bool,
    /// Total funds distributed so far (in token stroops)
    pub total_distributed: i128,
    /// Number of successful distribution rounds completed
    pub distribution_round: u32,
}

// ============================================================
//  STORAGE KEYS
// ============================================================

#[contracttype]
pub enum DataKey {
    /// Stores SplitProject by project_id
    Project(Symbol),
    /// Tracks available project-specific funds that can be distributed
    ProjectBalance(Symbol),
    /// Tracks how much each address has claimed per project
    Claimed(Symbol, Address),
    /// Total project count (for enumeration)
    ProjectCount,
}

// ============================================================
//  CONTRACT
// ============================================================

#[contract]
pub struct SplitNairaContract;

#[contractimpl]
impl SplitNairaContract {
    // ----------------------------------------------------------
    // CREATE PROJECT
    // ----------------------------------------------------------

    /// Creates a new royalty split project on-chain.
    ///
    /// # Arguments
    /// * `env`           - Soroban environment
    /// * `owner`         - Project owner / admin address
    /// * `project_id`    - Unique Symbol identifier for the project
    /// * `title`         - Human-readable project title
    /// * `project_type`  - Category string ("music", "film", etc.)
    /// * `token`         - Address of the Stellar token contract (XLM / USDC)
    /// * `collaborators` - Vec of Collaborator structs with addresses + basis points
    ///
    /// # Errors
    /// * `SplitError::InvalidSplit`      - if basis points don't sum to 10000
    /// * `SplitError::TooFewCollaborators` - if fewer than 2 collaborators provided
    /// * `SplitError::ProjectExists`     - if project_id already exists
    pub fn create_project(
        env: Env,
        owner: Address,
        project_id: Symbol,
        title: String,
        project_type: String,
        token: Address,
        collaborators: Vec<Collaborator>,
    ) -> Result<(), SplitError> {
        owner.require_auth();

        // Guard: project must not already exist
        if env
            .storage()
            .persistent()
            .has(&DataKey::Project(project_id.clone()))
        {
            return Err(SplitError::ProjectExists);
        }

        Self::validate_collaborators(&collaborators)?;

        let project = SplitProject {
            project_id: project_id.clone(),
            title,
            project_type,
            token,
            owner: owner.clone(),
            collaborators,
            locked: false,
            total_distributed: 0,
            distribution_round: 0,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id.clone()), &project);
        env.storage()
            .persistent()
            .set(&DataKey::ProjectBalance(project_id.clone()), &0i128);

        // Increment global project count
        let count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::ProjectCount)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::ProjectCount, &(count + 1));

        // Emit creation event
        SplitEvents::project_created(&env, &project_id, &owner);

        Ok(())
    }

    // ----------------------------------------------------------
    // UPDATE COLLABORATORS
    // ----------------------------------------------------------

    /// Updates collaborator addresses and basis point splits for an existing project.
    /// Only the project owner can update, and only while the project is unlocked.
    pub fn update_collaborators(
        env: Env,
        project_id: Symbol,
        owner: Address,
        collaborators: Vec<Collaborator>,
    ) -> Result<(), SplitError> {
        let mut project = Self::get_project_or_err(&env, &project_id)?;

        if project.owner != owner {
            return Err(SplitError::Unauthorized);
        }
        owner.require_auth();

        if project.locked {
            return Err(SplitError::ProjectLocked);
        }

        Self::validate_collaborators(&collaborators)?;

        project.collaborators = collaborators;
        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id), &project);

        Ok(())
    }

    // ----------------------------------------------------------
    // LOCK PROJECT
    // ----------------------------------------------------------

    /// Locks a project so splits can no longer be modified.
    /// Only the project owner can lock it.
    ///
    /// Once locked, the split percentages are permanently immutable.
    ///
    /// # Errors
    /// * `SplitError::NotFound`       - if project doesn't exist
    /// * `SplitError::Unauthorized`   - if caller is not the owner
    /// * `SplitError::AlreadyLocked`  - if project is already locked
    pub fn lock_project(env: Env, project_id: Symbol, owner: Address) -> Result<(), SplitError> {
        let mut project = Self::get_project_or_err(&env, &project_id)?;

        if project.owner != owner {
            return Err(SplitError::Unauthorized);
        }
        owner.require_auth();

        if project.locked {
            return Err(SplitError::AlreadyLocked);
        }

        project.locked = true;
        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id.clone()), &project);

        SplitEvents::project_locked(&env, &project_id);

        Ok(())
    }

    // ----------------------------------------------------------
    // DEPOSIT
    // ----------------------------------------------------------

    /// Deposits project funds into this contract and credits the target project's
    /// internal distributable balance.
    pub fn deposit(
        env: Env,
        project_id: Symbol,
        from: Address,
        amount: i128,
    ) -> Result<(), SplitError> {
        if amount <= 0 {
            return Err(SplitError::InvalidAmount);
        }

        let project = Self::get_project_or_err(&env, &project_id)?;
        from.require_auth();

        let token_client = token::Client::new(&env, &project.token);
        let contract_address = env.current_contract_address();
        token_client.transfer(&from, &contract_address, &amount);

        let prev_balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::ProjectBalance(project_id.clone()))
            .unwrap_or(0);

        env.storage().persistent().set(
            &DataKey::ProjectBalance(project_id),
            &(prev_balance + amount),
        );

        Ok(())
    }

    // ----------------------------------------------------------
    // DISTRIBUTE
    // ----------------------------------------------------------

    /// Distributes the target project's internal balance to all
    /// collaborators according to their basis point shares.
    ///
    /// Anyone can call distribute — the math is trustless.
    ///
    /// # Arguments
    /// * `env`        - Soroban environment
    /// * `project_id` - The project to distribute for
    ///
    /// # Errors
    /// * `SplitError::NotFound`   - if project doesn't exist
    /// * `SplitError::NoBalance`  - if contract has zero balance
    pub fn distribute(env: Env, project_id: Symbol) -> Result<(), SplitError> {
        let mut project = Self::get_project_or_err(&env, &project_id)?;

        // Read project-scoped distributable balance.
        let balance: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::ProjectBalance(project_id.clone()))
            .unwrap_or(0);
        if balance <= 0 {
            return Err(SplitError::NoBalance);
        }

        let token_client = token::Client::new(&env, &project.token);
        let contract_address = env.current_contract_address();

        let mut total_sent: i128 = 0;
        let last_index = project.collaborators.len() - 1;

        for (i, collab) in project.collaborators.iter().enumerate() {
            // Calculate share using basis points
            // For last collaborator, send remainder to avoid dust from rounding
            let amount = if i == last_index as usize {
                balance - total_sent
            } else {
                (balance * collab.basis_points as i128) / 10_000
            };

            if amount > 0 {
                token_client.transfer(&contract_address, &collab.address, &amount);

                // Update claimed ledger
                let prev_claimed: i128 = env
                    .storage()
                    .persistent()
                    .get(&DataKey::Claimed(
                        project_id.clone(),
                        collab.address.clone(),
                    ))
                    .unwrap_or(0);
                env.storage().persistent().set(
                    &DataKey::Claimed(project_id.clone(), collab.address.clone()),
                    &(prev_claimed + amount),
                );

                total_sent += amount;

                SplitEvents::payment_sent(&env, &project_id, &collab.address, amount);
            }
        }

        let remaining_balance = balance - total_sent;
        env.storage().persistent().set(
            &DataKey::ProjectBalance(project_id.clone()),
            &remaining_balance,
        );

        project.total_distributed += total_sent;
        project.distribution_round += 1;
        env.storage()
            .persistent()
            .set(&DataKey::Project(project_id.clone()), &project);

        SplitEvents::distribution_complete(
            &env,
            &project_id,
            project.distribution_round,
            total_sent,
        );

        Ok(())
    }

    // ----------------------------------------------------------
    // READ-ONLY QUERIES
    // ----------------------------------------------------------

    /// Returns the full SplitProject struct for a given project ID.
    pub fn get_project(env: Env, project_id: Symbol) -> Option<SplitProject> {
        env.storage()
            .persistent()
            .get(&DataKey::Project(project_id))
    }

    /// Returns how much a specific address has been paid for a project.
    pub fn get_claimed(env: Env, project_id: Symbol, address: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Claimed(project_id, address))
            .unwrap_or(0)
    }

    /// Returns the total number of projects created on this contract.
    pub fn get_project_count(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::ProjectCount)
            .unwrap_or(0)
    }

    /// Returns the project-scoped distributable balance.
    pub fn get_balance(env: Env, project_id: Symbol) -> Result<i128, SplitError> {
        Self::get_project_or_err(&env, &project_id)?;
        Ok(env
            .storage()
            .persistent()
            .get(&DataKey::ProjectBalance(project_id))
            .unwrap_or(0))
    }

    // ----------------------------------------------------------
    // INTERNAL HELPERS
    // ----------------------------------------------------------

    fn get_project_or_err(env: &Env, project_id: &Symbol) -> Result<SplitProject, SplitError> {
        env.storage()
            .persistent()
            .get(&DataKey::Project(project_id.clone()))
            .ok_or(SplitError::NotFound)
    }

    fn validate_collaborators(collaborators: &Vec<Collaborator>) -> Result<(), SplitError> {
        if collaborators.len() < 2 {
            return Err(SplitError::TooFewCollaborators);
        }

        let mut total_bp: u32 = 0;
        for (i, collab) in collaborators.iter().enumerate() {
            if collab.basis_points == 0 {
                return Err(SplitError::ZeroShare);
            }
            total_bp += collab.basis_points;

            for (j, other) in collaborators.iter().enumerate() {
                if i != j && collab.address == other.address {
                    return Err(SplitError::DuplicateCollaborator);
                }
            }
        }

        if total_bp != 10_000 {
            return Err(SplitError::InvalidSplit);
        }

        Ok(())
    }
}
