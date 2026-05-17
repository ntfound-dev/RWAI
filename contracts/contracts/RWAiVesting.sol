// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title RWAiVesting
 * @notice Linear vesting with optional cliff for all RWAI token allocations.
 *
 * Allocation schedule (100M RWAI total):
 *  - Ecosystem & grants  25M  4yr linear, no cliff
 *  - Protocol treasury   20M  DAO-controlled (direct transfer, not vested here)
 *  - Team & contributors 18M  1yr cliff + 3yr linear
 *  - Community & airdrops 15M  6mo cliff + linear to TGE+3yr
 *  - Investors (seed)    12M  6mo cliff + 2yr linear
 *  - Liquidity           10M  unlocked at TGE (direct transfer)
 *
 * Admin calls createSchedule() once per beneficiary, transferring tokens in.
 * Beneficiaries call claim() at any time to withdraw vested-but-unclaimed tokens.
 * Revocable schedules (team, investors) can be revoked — unvested tokens return to admin.
 */
contract RWAiVesting is AccessControl, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant VESTING_ADMIN = keccak256("VESTING_ADMIN");

    IERC20 public immutable token;

    struct Schedule {
        address beneficiary;
        uint256 total;
        uint256 claimed;
        uint256 startTime;      // epoch: when linear vesting begins counting
        uint256 cliffDuration;  // seconds before any tokens vest
        uint256 duration;       // total vesting window (from startTime)
        string  category;       // "team" | "investors" | "ecosystem" | "community" | "liquidity"
        bool    revocable;
        bool    revoked;
    }

    mapping(uint256 => Schedule) public schedules;
    uint256 public scheduleCount;

    event ScheduleCreated(
        uint256 indexed id,
        address indexed beneficiary,
        uint256 total,
        string  category,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 duration
    );
    event TokensClaimed(uint256 indexed id, address indexed beneficiary, uint256 amount);
    event ScheduleRevoked(uint256 indexed id, uint256 unvestedReturned);

    constructor(address tokenAddress, address admin) {
        require(tokenAddress != address(0), "Vesting: zero token");
        require(admin != address(0),        "Vesting: zero admin");
        token = IERC20(tokenAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(VESTING_ADMIN, admin);
    }

    // ── Admin ──────────────────────────────────────────────────────

    /**
     * @notice Create a vesting schedule. Admin must have approved this contract
     *         to transfer `total` tokens before calling.
     * @param beneficiary  Token recipient
     * @param total        Total tokens to vest
     * @param startTime    Unix timestamp when linear vesting begins (TGE date)
     * @param cliffDuration Seconds after startTime before first tokens vest
     * @param duration     Total seconds of the vesting window
     * @param category     Human-readable label
     * @param revocable    Whether admin can revoke unvested tokens
     */
    function createSchedule(
        address beneficiary,
        uint256 total,
        uint256 startTime,
        uint256 cliffDuration,
        uint256 duration,
        string  calldata category,
        bool    revocable
    ) external onlyRole(VESTING_ADMIN) returns (uint256 id) {
        require(beneficiary != address(0), "Vesting: zero beneficiary");
        require(total        > 0,          "Vesting: zero total");
        require(duration     > 0,          "Vesting: zero duration");
        require(startTime    > 0,          "Vesting: zero startTime");

        token.safeTransferFrom(msg.sender, address(this), total);

        id = scheduleCount++;
        schedules[id] = Schedule({
            beneficiary:   beneficiary,
            total:         total,
            claimed:       0,
            startTime:     startTime,
            cliffDuration: cliffDuration,
            duration:      duration,
            category:      category,
            revocable:     revocable,
            revoked:       false
        });

        emit ScheduleCreated(id, beneficiary, total, category, startTime, cliffDuration, duration);
    }

    // ── Views ──────────────────────────────────────────────────────

    function vestedAmount(uint256 id) public view returns (uint256) {
        Schedule storage s = schedules[id];
        if (s.revoked) return s.claimed; // no more after revoke
        uint256 ts = block.timestamp;
        if (ts < s.startTime + s.cliffDuration) return 0;
        uint256 elapsed = ts - s.startTime;
        if (elapsed >= s.duration) return s.total;
        return (s.total * elapsed) / s.duration;
    }

    function claimable(uint256 id) public view returns (uint256) {
        return vestedAmount(id) - schedules[id].claimed;
    }

    function getSchedule(uint256 id) external view returns (Schedule memory) {
        return schedules[id];
    }

    // ── Beneficiary ────────────────────────────────────────────────

    function claim(uint256 id) external nonReentrant {
        Schedule storage s = schedules[id];
        require(msg.sender == s.beneficiary, "Vesting: not beneficiary");
        require(!s.revoked,                  "Vesting: schedule revoked");

        uint256 amount = claimable(id);
        require(amount > 0, "Vesting: nothing to claim");

        s.claimed += amount;
        token.safeTransfer(s.beneficiary, amount);

        emit TokensClaimed(id, s.beneficiary, amount);
    }

    // ── Admin revoke ───────────────────────────────────────────────

    function revoke(uint256 id) external onlyRole(VESTING_ADMIN) {
        Schedule storage s = schedules[id];
        require(s.revocable, "Vesting: not revocable");
        require(!s.revoked,  "Vesting: already revoked");

        uint256 vested   = vestedAmount(id);
        uint256 unvested = s.total - vested;

        s.revoked  = true;

        if (unvested > 0) {
            token.safeTransfer(msg.sender, unvested);
        }

        emit ScheduleRevoked(id, unvested);
    }
}
