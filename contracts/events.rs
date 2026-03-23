use soroban_sdk::{Address, Env, Symbol};

/// All on-chain events emitted by the SplitNaira contract.
/// Events are indexed by Stellar's event stream and can be
/// consumed by the SplitNaira frontend via Horizon API.
pub struct SplitEvents;

impl SplitEvents {
    /// Emitted when a new royalty split project is created.
    ///
    /// Topics:  ["project_created", project_id]
    /// Data:    owner address
    pub fn project_created(env: &Env, project_id: &Symbol, owner: &Address) {
        env.events().publish(
            (Symbol::new(env, "project_created"), project_id.clone()),
            owner.clone(),
        );
    }

    /// Emitted when a project's splits are permanently locked.
    ///
    /// Topics:  ["project_locked", project_id]
    /// Data:    project_id
    pub fn project_locked(env: &Env, project_id: &Symbol) {
        env.events().publish(
            (Symbol::new(env, "project_locked"), project_id.clone()),
            project_id.clone(),
        );
    }

    /// Emitted for each individual payment sent during a distribution.
    ///
    /// Topics:  ["payment_sent", project_id]
    /// Data:    (recipient address, amount in stroops)
    pub fn payment_sent(env: &Env, project_id: &Symbol, recipient: &Address, amount: i128) {
        env.events().publish(
            (Symbol::new(env, "payment_sent"), project_id.clone()),
            (recipient.clone(), amount),
        );
    }

    /// Emitted once when a full distribution round completes.
    ///
    /// Topics:  ["distribution_complete", project_id]
    /// Data:    (round_number, total amount distributed in this round in stroops)
    pub fn distribution_complete(env: &Env, project_id: &Symbol, round: u32, total: i128) {
        env.events().publish(
            (
                Symbol::new(env, "distribution_complete"),
                project_id.clone(),
            ),
            (round, total),
        );
    }
}
