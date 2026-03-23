#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, token, Address, Env, String, Symbol, Vec};

// ============================================================
//  TEST HELPERS
// ============================================================

fn create_test_env() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy a mock token contract (represents USDC or XLM)
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract(token_admin.clone());

    (env, token_admin, token_contract)
}

fn make_collaborators(env: &Env, addresses: Vec<Address>, bps: Vec<u32>) -> Vec<Collaborator> {
    let mut collabs = Vec::new(env);
    for (addr, bp) in addresses.iter().zip(bps.iter()) {
        collabs.push_back(Collaborator {
            address: addr.clone(),
            alias: String::from_str(env, "Test User"),
            basis_points: bp,
        });
    }
    collabs
}

fn deposit_to_project(
    env: &Env,
    client: &SplitNairaContractClient,
    token: &Address,
    project_id: &Symbol,
    from: &Address,
    amount: i128,
) {
    let token_client = token::StellarAssetClient::new(env, token);
    token_client.mint(from, &amount);
    client.deposit(project_id, from, &amount);
}

// ============================================================
//  CREATION TESTS
// ============================================================

#[test]
fn test_create_project_success() {
    let (env, _admin, token) = create_test_env();
    let contract_id = env.register_contract(None, SplitNairaContract);
    let client = SplitNairaContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    let collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice.clone(), bob.clone()]),
        Vec::from_slice(&env, &[6000u32, 4000u32]), // 60% / 40%
    );

    client.create_project(
        &owner,
        &Symbol::new(&env, "afrobeats_vol3"),
        &String::from_str(&env, "Afrobeats Vol. 3"),
        &String::from_str(&env, "music"),
        &token,
        &collabs,
    );
    assert_eq!(client.get_project_count(), 1);

    let project = client
        .get_project(&Symbol::new(&env, "afrobeats_vol3"))
        .unwrap();
    assert_eq!(project.collaborators.len(), 2);
    assert_eq!(project.locked, false);
    assert_eq!(project.total_distributed, 0);
    assert_eq!(project.distribution_round, 0);
    assert_eq!(client.get_balance(&Symbol::new(&env, "afrobeats_vol3")), 0);
}

#[test]
fn test_create_project_fails_invalid_split() {
    let (env, _admin, token) = create_test_env();
    let contract_id = env.register_contract(None, SplitNairaContract);
    let client = SplitNairaContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);

    // 60% + 30% = 90% — does NOT sum to 100%
    let collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice.clone(), bob.clone()]),
        Vec::from_slice(&env, &[6000u32, 3000u32]),
    );

    let result = client.try_create_project(
        &owner,
        &Symbol::new(&env, "bad_split"),
        &String::from_str(&env, "Bad Split Project"),
        &String::from_str(&env, "music"),
        &token,
        &collabs,
    );

    assert_eq!(result, Err(Ok(SplitError::InvalidSplit)));
}

#[test]
fn test_create_project_fails_too_few_collaborators() {
    let (env, _admin, token) = create_test_env();
    let contract_id = env.register_contract(None, SplitNairaContract);
    let client = SplitNairaContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let alice = Address::generate(&env);

    // Only 1 collaborator — minimum is 2
    let collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice.clone()]),
        Vec::from_slice(&env, &[10000u32]),
    );

    let result = client.try_create_project(
        &owner,
        &Symbol::new(&env, "solo"),
        &String::from_str(&env, "Solo Project"),
        &String::from_str(&env, "art"),
        &token,
        &collabs,
    );

    assert_eq!(result, Err(Ok(SplitError::TooFewCollaborators)));
}

#[test]
fn test_create_project_fails_duplicate_id() {
    let (env, _admin, token) = create_test_env();
    let contract_id = env.register_contract(None, SplitNairaContract);
    let client = SplitNairaContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice.clone(), bob.clone()]),
        Vec::from_slice(&env, &[5000u32, 5000u32]),
    );

    // First creation — should succeed
    client.create_project(
        &owner,
        &Symbol::new(&env, "dup_test"),
        &String::from_str(&env, "Duplicate Test"),
        &String::from_str(&env, "film"),
        &token,
        &collabs.clone(),
    );

    // Second creation with same ID — should fail
    let result = client.try_create_project(
        &owner,
        &Symbol::new(&env, "dup_test"),
        &String::from_str(&env, "Duplicate Test"),
        &String::from_str(&env, "film"),
        &token,
        &collabs,
    );

    assert_eq!(result, Err(Ok(SplitError::ProjectExists)));
}

#[test]
fn test_create_project_fails_duplicate_collaborator_address() {
    let (env, _admin, token) = create_test_env();
    let contract_id = env.register_contract(None, SplitNairaContract);
    let client = SplitNairaContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let alice = Address::generate(&env);

    // Same address appears twice — should fail.
    let collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice.clone(), alice.clone()]),
        Vec::from_slice(&env, &[5000u32, 5000u32]),
    );

    let result = client.try_create_project(
        &owner,
        &Symbol::new(&env, "dup_address"),
        &String::from_str(&env, "Duplicate Address"),
        &String::from_str(&env, "music"),
        &token,
        &collabs,
    );

    assert_eq!(result, Err(Ok(SplitError::DuplicateCollaborator)));
}

// ============================================================
//  UPDATE + LOCK TESTS
// ============================================================

#[test]
fn test_update_collaborators_success_before_lock() {
    let (env, _admin, token) = create_test_env();
    let contract_id = env.register_contract(None, SplitNairaContract);
    let client = SplitNairaContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    let initial_collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice.clone(), bob.clone()]),
        Vec::from_slice(&env, &[6000u32, 4000u32]),
    );

    client.create_project(
        &owner,
        &Symbol::new(&env, "editable_split"),
        &String::from_str(&env, "Editable Split"),
        &String::from_str(&env, "music"),
        &token,
        &initial_collabs,
    );

    let updated_collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice.clone(), bob.clone(), carol.clone()]),
        Vec::from_slice(&env, &[5000u32, 3000u32, 2000u32]),
    );

    client.update_collaborators(
        &Symbol::new(&env, "editable_split"),
        &owner,
        &updated_collabs,
    );

    let project = client
        .get_project(&Symbol::new(&env, "editable_split"))
        .unwrap();
    assert_eq!(project.locked, false);
    assert_eq!(project.collaborators.len(), 3);
    assert_eq!(project.collaborators.get(0u32).unwrap().address, alice);
    assert_eq!(
        project.collaborators.get(0u32).unwrap().basis_points,
        5000u32
    );
    assert_eq!(project.collaborators.get(1u32).unwrap().address, bob);
    assert_eq!(
        project.collaborators.get(1u32).unwrap().basis_points,
        3000u32
    );
    assert_eq!(project.collaborators.get(2u32).unwrap().address, carol);
    assert_eq!(
        project.collaborators.get(2u32).unwrap().basis_points,
        2000u32
    );
}

#[test]
fn test_update_collaborators_fails_when_locked() {
    let (env, _admin, token) = create_test_env();
    let contract_id = env.register_contract(None, SplitNairaContract);
    let client = SplitNairaContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    let collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice.clone(), bob.clone()]),
        Vec::from_slice(&env, &[7000u32, 3000u32]),
    );

    client.create_project(
        &owner,
        &Symbol::new(&env, "locked_update"),
        &String::from_str(&env, "Locked Update"),
        &String::from_str(&env, "film"),
        &token,
        &collabs,
    );
    client.lock_project(&Symbol::new(&env, "locked_update"), &owner);

    let updated_collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice, bob, carol]),
        Vec::from_slice(&env, &[5000u32, 3000u32, 2000u32]),
    );

    let result = client.try_update_collaborators(
        &Symbol::new(&env, "locked_update"),
        &owner,
        &updated_collabs,
    );
    assert_eq!(result, Err(Ok(SplitError::ProjectLocked)));
}

#[test]
fn test_lock_project_success() {
    let (env, _admin, token) = create_test_env();
    let contract_id = env.register_contract(None, SplitNairaContract);
    let client = SplitNairaContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice, bob]),
        Vec::from_slice(&env, &[7000u32, 3000u32]),
    );

    client.create_project(
        &owner,
        &Symbol::new(&env, "nollywood_film"),
        &String::from_str(&env, "Nollywood Feature Film"),
        &String::from_str(&env, "film"),
        &token,
        &collabs,
    );

    client.lock_project(&Symbol::new(&env, "nollywood_film"), &owner);

    let project = client
        .get_project(&Symbol::new(&env, "nollywood_film"))
        .unwrap();
    assert_eq!(project.locked, true);
}

// ============================================================
//  DEPOSIT + DISTRIBUTION TESTS
// ============================================================

#[test]
fn test_distribute_splits_correctly() {
    let (env, _token_admin, token) = create_test_env();
    let contract_id = env.register_contract(None, SplitNairaContract);
    let client = SplitNairaContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let funder = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);

    // 50% / 30% / 20% split
    let collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice.clone(), bob.clone(), carol.clone()]),
        Vec::from_slice(&env, &[5000u32, 3000u32, 2000u32]),
    );

    let project_id = Symbol::new(&env, "podcast_ep1");
    client.create_project(
        &owner,
        &project_id,
        &String::from_str(&env, "Podcast Episode 1"),
        &String::from_str(&env, "podcast"),
        &token,
        &collabs,
    );

    // Deposit 1000 tokens (in stroops = 1000 * 10^7) into this project only.
    deposit_to_project(
        &env,
        &client,
        &token,
        &project_id,
        &funder,
        1_000_0000000i128,
    );
    assert_eq!(client.get_balance(&project_id), 1_000_0000000i128);

    client.distribute(&project_id);

    // Check balances: 50%, 30%, 20% of 1000 tokens
    let token_balance = token::Client::new(&env, &token);
    assert_eq!(token_balance.balance(&alice), 500_0000000i128); // 50%
    assert_eq!(token_balance.balance(&bob), 300_0000000i128); // 30%
    assert_eq!(token_balance.balance(&carol), 200_0000000i128); // 20%

    // Check claimed ledger
    assert_eq!(client.get_claimed(&project_id, &alice), 500_0000000i128);

    // Check distribution metadata and project-scoped remaining balance
    let project = client.get_project(&project_id).unwrap();
    assert_eq!(project.total_distributed, 1_000_0000000i128);
    assert_eq!(project.distribution_round, 1);
    assert_eq!(client.get_balance(&project_id), 0);
}

#[test]
fn test_distribute_fails_no_balance() {
    let (env, _admin, token) = create_test_env();
    let contract_id = env.register_contract(None, SplitNairaContract);
    let client = SplitNairaContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice, bob]),
        Vec::from_slice(&env, &[5000u32, 5000u32]),
    );

    let project_id = Symbol::new(&env, "empty_project");
    client.create_project(
        &owner,
        &project_id,
        &String::from_str(&env, "Empty Project"),
        &String::from_str(&env, "art"),
        &token,
        &collabs,
    );

    // No project deposit — distribute should fail and round should remain 0.
    let result = client.try_distribute(&project_id);
    assert_eq!(result, Err(Ok(SplitError::NoBalance)));

    let project = client.get_project(&project_id).unwrap();
    assert_eq!(project.distribution_round, 0);
}

#[test]
fn test_distribution_round_increments_only_on_success() {
    let (env, _admin, token) = create_test_env();
    let contract_id = env.register_contract(None, SplitNairaContract);
    let client = SplitNairaContractClient::new(&env, &contract_id);

    let owner = Address::generate(&env);
    let funder = Address::generate(&env);
    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let collabs = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice.clone(), bob.clone()]),
        Vec::from_slice(&env, &[5000u32, 5000u32]),
    );

    let project_id = Symbol::new(&env, "round_counter");
    client.create_project(
        &owner,
        &project_id,
        &String::from_str(&env, "Round Counter"),
        &String::from_str(&env, "music"),
        &token,
        &collabs,
    );

    // Failed distribute does not increment round.
    let failed = client.try_distribute(&project_id);
    assert_eq!(failed, Err(Ok(SplitError::NoBalance)));
    assert_eq!(
        client.get_project(&project_id).unwrap().distribution_round,
        0
    );

    // First successful distribute -> round 1.
    deposit_to_project(&env, &client, &token, &project_id, &funder, 100_0000000i128);
    client.distribute(&project_id);
    assert_eq!(
        client.get_project(&project_id).unwrap().distribution_round,
        1
    );

    // Second successful distribute -> round 2.
    deposit_to_project(&env, &client, &token, &project_id, &funder, 50_0000000i128);
    client.distribute(&project_id);
    let project = client.get_project(&project_id).unwrap();
    assert_eq!(project.distribution_round, 2);
    assert_eq!(project.total_distributed, 150_0000000i128);
}

#[test]
fn test_multi_project_balances_are_isolated() {
    let (env, _admin, token) = create_test_env();
    let contract_id = env.register_contract(None, SplitNairaContract);
    let client = SplitNairaContractClient::new(&env, &contract_id);

    let owner_a = Address::generate(&env);
    let owner_b = Address::generate(&env);
    let funder_a = Address::generate(&env);
    let funder_b = Address::generate(&env);

    let alice = Address::generate(&env);
    let bob = Address::generate(&env);
    let carol = Address::generate(&env);
    let dave = Address::generate(&env);

    let project_a = Symbol::new(&env, "project_a");
    let project_b = Symbol::new(&env, "project_b");

    let collabs_a = make_collaborators(
        &env,
        Vec::from_slice(&env, &[alice.clone(), bob.clone()]),
        Vec::from_slice(&env, &[5000u32, 5000u32]),
    );
    let collabs_b = make_collaborators(
        &env,
        Vec::from_slice(&env, &[carol.clone(), dave.clone()]),
        Vec::from_slice(&env, &[7000u32, 3000u32]),
    );

    client.create_project(
        &owner_a,
        &project_a,
        &String::from_str(&env, "Project A"),
        &String::from_str(&env, "music"),
        &token,
        &collabs_a,
    );
    client.create_project(
        &owner_b,
        &project_b,
        &String::from_str(&env, "Project B"),
        &String::from_str(&env, "film"),
        &token,
        &collabs_b,
    );

    deposit_to_project(
        &env,
        &client,
        &token,
        &project_a,
        &funder_a,
        1_000_0000000i128,
    );
    deposit_to_project(
        &env,
        &client,
        &token,
        &project_b,
        &funder_b,
        2_000_0000000i128,
    );

    // Distributing project A should not consume project B funds.
    client.distribute(&project_a);

    let token_balance = token::Client::new(&env, &token);
    assert_eq!(token_balance.balance(&alice), 500_0000000i128);
    assert_eq!(token_balance.balance(&bob), 500_0000000i128);
    assert_eq!(token_balance.balance(&carol), 0);
    assert_eq!(token_balance.balance(&dave), 0);

    assert_eq!(client.get_balance(&project_a), 0);
    assert_eq!(client.get_balance(&project_b), 2_000_0000000i128);

    let project_a_data = client.get_project(&project_a).unwrap();
    let project_b_data = client.get_project(&project_b).unwrap();
    assert_eq!(project_a_data.distribution_round, 1);
    assert_eq!(project_a_data.total_distributed, 1_000_0000000i128);
    assert_eq!(project_b_data.distribution_round, 0);
    assert_eq!(project_b_data.total_distributed, 0);
}
