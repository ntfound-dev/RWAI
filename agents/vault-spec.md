# Vault Solidity Specification (Hybrid model)

## Ringkasan
Vault adalah kontrak on‑chain yang menahan dana user di L2. User deposit ke Vault dan memberikan otorisasi terbatas (allowance) kepada satu atau lebih `agent` untuk mengeksekusi transaksi atas nama user dalam batas yang ditentukan (amount, expiry). Vault menyediakan escape hatch (`withdraw` / `emergencyWithdraw`) dan kontrol governance (multisig / timelock / pause).

## Design goals
- Preserve user control: user selalu bisa menarik dana atau mencabut allowance.
- Batas exposure: per‑user and per‑agent caps, per‑tx + daily limits.
- Support meta‑tx/relayer pattern: agent dapat submit tx melalui Vault tanpa memiliki private key user.
- Auditability & events for off‑chain monitoring.

## EIP‑712 Consent (optional)
The consent enables an off‑chain signed permission that the relayer/agent can submit to `setAgentAllowanceBySignature` or `executeWithSignature`.

Domain:
- name: "HybridVault"
- version: "1"
- chainId: uint256
- verifyingContract: address

Struct `AgentConsent`:
- address user
- address agent
- address token
- uint256 amount
- uint256 expiry
- uint256 nonce

## Solidity Interface (pseudo)

interface IHybridVault {
    // Deposits
    function deposit(address token, uint256 amount) external;

    // User-managed allowance
    function setAgentAllowance(address agent, address token, uint256 amount, uint256 expiry) external;
    function revokeAllowance(address agent, address token) external;

    // Signature-based allowance (EIP-712)
    function setAgentAllowanceBySig(
        address user,
        address agent,
        address token,
        uint256 amount,
        uint256 expiry,
        uint256 nonce,
        bytes calldata signature
    ) external;

    // Agent executes actions on behalf of user within allowance
    function executeOnBehalf(
        address user,
        address token,
        address to,
        uint256 amount,
        bytes calldata data
    ) external;

    // User withdraws
    function withdraw(address token, uint256 amount) external;

    // Emergency: user withdraw all (optionally timelocked)
    function emergencyWithdraw(address token) external;

    // Admin controls
    function pause() external;
    function unpause() external;
}

## Data Structures
- mapping(address user => mapping(address token => uint256 balance)) balances;
- mapping(address user => mapping(address agent => mapping(address token => Allowance))) allowances;

struct Allowance {
    uint256 amount; // remaining allowance
    uint256 expiry; // timestamp
    uint256 dailySpent; // optional for daily cap
}

## Events
- event Deposited(address indexed user, address indexed token, uint256 amount);
- event AgentAllowanceSet(address indexed user, address indexed agent, address indexed token, uint256 amount, uint256 expiry);
- event AgentAllowanceRevoked(address indexed user, address indexed agent, address indexed token);
- event AgentExecuted(address indexed user, address indexed agent, address indexed to, uint256 amount, bytes32 dataHash);
- event Withdrawn(address indexed user, address indexed token, uint256 amount);
- event EmergencyWithdrawn(address indexed user, address indexed token, uint256 amount);

## Errors/Require checks
- User only: `setAgentAllowance` / `revokeAllowance` must be called by `user`.
- Agent only: `executeOnBehalf` must be called by `agent` and check allowance/expiry.
- Balance checks: cannot execute more than `balances[user][token] - lockedForOtherAgents`.
- Per-tx & per-day caps: enforce limits before state update.

## executeOnBehalf semantics
- When called, Vault MUST:
  1. verify allowance exists and not expired.
  2. check amount ≤ allowance.amount and amount ≤ perTxCap and within daily cap.
  3. decrease allowance.amount and balances[user][token] accordingly.
  4. perform call to `to` with optional `data` and transfer tokens if needed.
  5. emit `AgentExecuted` with dataHash = keccak256(data).

Note: Consider two flavors:
- Simple token transfer: Vault transfers ERC‑20 to `to` and emits event.
- Call execution: Vault makes low‑level call to `to` letting it perform complex ops (e.g., swap, provide liquidity). This is more powerful but riskier — user must consent explicitly.

## Security controls
- `perUserPercentCap`: default 10% of on‑chain balance per period (configurable by governance).
- `perAgentDailyCap`: track daily usage per agent.
- `timelock` for admin changes (change agent, change caps).
- `pause()` to freeze all agent executions (multisig controlled).
- `reentrancy` guards on state‑modifying functions.
- Validate ERC20 returns and use safeTransfer patterns.

## Non‑custodial escape hatches
- `revokeAllowance` — immediate revoke from user.
- `withdraw` — user withdraws funds.
- `emergencyWithdraw` — special path if pause triggered; may be timelocked.

## Relayer / Meta‑Tx
- Support `executeWithSig` where user pre‑signs the intended execution and the agent/relayer submits it, reducing UX friction.

## Tests to write
- Unit tests: deposit, set/revoke allowance, expiry, executeOnBehalf success & failure, withdraw, emergencyWithdraw, pause/unpause.
- Limits: per‑tx cap, per‑day cap, percent cap enforcement.
- EIP‑712 signature flows: `setAgentAllowanceBySig`, replay protection via nonce.
- Integration: agent performs swap via DEX contracts using Vault `executeOnBehalf`.

## Integration points (repo)
- Connect `executeOnBehalf` with `agents/mantle/executor.py` which will submit transactions as the agent (using multisig/relayer).
- UI pages: `app/tokenize` and `app/bridge` — add deposit and consent flows; `app/portfolio` shows balances and allows revoke/withdraw.

## Gas & UX considerations
- Keep Vault minimal to reduce deploy cost.
- Offload heavy logic (strategies) to external contracts called by Vault (Vault only grants tokens and performs safe calls).
- For UX, prefer EIP‑712 consent + relayer so user signs once and agent handles subsequent interactions.

## Example flows

1) Deposit + set allowance (on‑chain)
- user calls `deposit(token, amount)`
- user calls `setAgentAllowance(agent, token, amount/10, expiry)`

2) Deposit + off‑chain consent + relayer
- user signs `AgentConsent(user, agent, token, amount/10, expiry, nonce)`
- relayer calls `setAgentAllowanceBySig(...)`

3) Agent executes strategy
- agent calls `executeOnBehalf(user, token, strategyContract, amount, data)`
- Vault verifies and calls `strategyContract.executeOnBehalfFromVault(user, token, amount, data)`

## Recommended next steps (implementation roadmap)
1. Implement minimal `HybridVault.sol` in `contracts/` with ERC20 support, allowance storage, and `executeOnBehalf` restricted to agents.
2. Add EIP‑712 helpers and `setAgentAllowanceBySig`.
3. Write comprehensive tests in `test/` (Hardhat/Foundry).
4. Implement relayer logic in `agents/mantle/executor.py` to call `executeOnBehalf`.

---
Created to drive prototype implementation and tests. Ask if you want me to scaffold `HybridVault.sol` now.
