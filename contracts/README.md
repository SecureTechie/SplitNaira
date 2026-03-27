# SplitNaira Soroban Contract Spec

This document defines the public interface exposed by `SplitNairaContract` in `contracts/lib.rs`.

## Data Model

### Collaborator
- `address: Address` - Collaborator Stellar address.
- `alias: String` - Human-readable collaborator label.
- `basis_points: u32` - Share in basis points (`10_000 = 100%`).

### SplitProject
- `project_id: Symbol`
- `title: String`
- `project_type: String`
- `token: Address` - Token contract for deposits/distributions.
- `owner: Address` - Project owner/admin.
- `collaborators: Vec<Collaborator>`
- `locked: bool`
- `total_distributed: i128`
- `distribution_round: u32`

### ClaimableInfo
- `claimed: i128` - Total amount paid to collaborator for project.
- `distribution_round: u32` - Last completed distribution round.

## Public Methods

### Admin + Allowlist

### `set_admin(admin: Address) -> Result<(), SplitError>`
Sets or rotates contract admin.
- Auth: `admin` (first setup) or current admin (rotation).
- Errors: `Unauthorized` via auth checks.

### `allow_token(admin: Address, token: Address) -> Result<(), SplitError>`
Allowlists a token contract address.
- Auth: contract admin.
- Errors: `AdminNotSet`, `Unauthorized`.

### `disallow_token(admin: Address, token: Address) -> Result<(), SplitError>`
Removes a token from allowlist.
- Auth: contract admin.
- Errors: `AdminNotSet`, `Unauthorized`.

### Project lifecycle

### `create_project(owner, project_id, title, project_type, token, collaborators) -> Result<(), SplitError>`
Creates a split project and initializes project balance to `0`.
- Auth: `owner`.
- Errors: `ProjectExists`, `TooFewCollaborators`, `ZeroShare`, `DuplicateCollaborator`, `InvalidSplit`, `TokenNotAllowed`, `ArithmeticOverflow`.

### `update_collaborators(project_id, owner, collaborators) -> Result<(), SplitError>`
Updates collaborator split definitions when unlocked.
- Auth: `owner`.
- Errors: `NotFound`, `Unauthorized`, `ProjectLocked`, `TooFewCollaborators`, `ZeroShare`, `DuplicateCollaborator`, `InvalidSplit`, `ArithmeticOverflow`.

### `lock_project(project_id, owner) -> Result<(), SplitError>`
Locks collaborator configuration permanently.
- Auth: `owner`.
- Errors: `NotFound`, `Unauthorized`, `AlreadyLocked`.

### `update_project_metadata(project_id, owner, title, project_type) -> Result<(), SplitError>`
Updates title/type while unlocked.
- Auth: `owner`.
- Errors: `NotFound`, `Unauthorized`, `ProjectLocked`.

### Funds flow

### `deposit(project_id, from, amount) -> Result<(), SplitError>`
Transfers `amount` from `from` to contract and credits `ProjectBalance(project_id)`.
- Auth: `from`.
- Errors: `InvalidAmount`, `NotFound`.

### `distribute(project_id) -> Result<(), SplitError>`
Distributes project balance to collaborators by basis points.
- Auth: none (permissionless trigger).
- Errors: `NotFound`, `NoBalance`.

### `withdraw_unallocated(admin, token, to, amount) -> Result<(), SplitError>`
Admin-only recovery of tokens held by contract but not tracked in any project ledger.
- Unallocated formula:
  - `token_balance(contract) - sum(project_balance for projects using token)`
- Safety: Cannot withdraw more than current unallocated amount.
- Auth: contract admin.
- Errors: `AdminNotSet`, `Unauthorized`, `InvalidAmount`, `InsufficientUnallocated`, `ArithmeticOverflow`.

### Read-only queries

### `get_project(project_id) -> Option<SplitProject>`
Returns project or `None`.

### `project_exists(project_id) -> bool`
Cheap existence check that does not load full struct and never panics.

### `get_claimed(project_id, address) -> i128`
Returns total claimed amount for collaborator in project.

### `get_claimable(project_id, collaborator) -> Result<ClaimableInfo, SplitError>`
Returns claimed amount plus project `distribution_round`.
- Errors: `NotFound`.

### `get_balance(project_id) -> Result<i128, SplitError>`
Returns project-scoped distributable balance.
- Errors: `NotFound`.

### `get_unallocated_balance(token) -> Result<i128, SplitError>`
Returns token units held by contract that are not attributed to any project balance.
- Errors: `ArithmeticOverflow`.

### `get_project_count() -> u32`
Returns total number of created projects.

### `list_projects(start, limit) -> Vec<SplitProject>`
Paginated projects.

### `list_project_ids(start, limit) -> Vec<Symbol>`
Paginated project IDs.

### `get_project_ids(start, limit) -> Vec<Symbol>`
Paginated project IDs in creation order.

### `is_token_allowed(token) -> bool`
Returns allowlist status.

### `get_allowed_token_count() -> u32`
Returns count of allowlisted token addresses.

### `get_admin() -> Option<Address>`
Returns current admin.

## Events

Soroban event shape is `(topics, data)`. This contract uses `topics = (event_name: Symbol, subject)`.

### `project_created`
- Topics format: `("project_created", project_id)`
- Data format: `owner`
- Example:
  - Topics: `("project_created", "afrobeats_vol3")`
  - Data: `G...OWNER`

### `project_locked`
- Topics format: `("project_locked", project_id)`
- Data format: `project_id`
- Example:
  - Topics: `("project_locked", "afrobeats_vol3")`
  - Data: `"afrobeats_vol3"`

### `payment_sent`
- Topics format: `("payment_sent", project_id)`
- Data format: `(recipient, amount)`
- Example:
  - Topics: `("payment_sent", "afrobeats_vol3")`
  - Data: `(G...RECIPIENT, 5000000000)`

### `distribution_complete`
- Topics format: `("distribution_complete", project_id)`
- Data format: `(round, total)`
- Example:
  - Topics: `("distribution_complete", "afrobeats_vol3")`
  - Data: `(1, 10000000000)`

### `deposit_received`
- Topics format: `("deposit_received", project_id)`
- Data format: `(from, amount)`
- Example:
  - Topics: `("deposit_received", "afrobeats_vol3")`
  - Data: `(G...FUNDER, 10000000000)`

### `metadata_updated`
- Topics format: `("metadata_updated", project_id)`
- Data format: `project_id`
- Example:
  - Topics: `("metadata_updated", "afrobeats_vol3")`
  - Data: `"afrobeats_vol3"`

### `unallocated_withdrawn`
- Topics format: `("unallocated_withdrawn", token)`
- Data format: `(admin, to, amount, remaining_unallocated)`
- Example:
  - Topics: `("unallocated_withdrawn", C...TOKEN)`
  - Data: `(G...ADMIN, G...TREASURY, 2000000000, 1000000000)`

## Error Codes

- `1` `ProjectExists`
- `2` `NotFound`
- `3` `Unauthorized`
- `4` `InvalidSplit`
- `5` `TooFewCollaborators`
- `6` `ZeroShare`
- `7` `NoBalance`
- `8` `AlreadyLocked`
- `9` `ProjectLocked`
- `10` `DuplicateCollaborator`
- `11` `InvalidAmount`
- `12` `TokenNotAllowed`
- `13` `AdminNotSet`
- `14` `ArithmeticOverflow`
- `15` `InsufficientUnallocated`
