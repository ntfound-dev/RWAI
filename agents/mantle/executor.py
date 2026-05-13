"""
On-chain write operations — called after agent decisions.
Requires AGENT_PRIVATE_KEY in env to sign transactions.
Gracefully no-ops if chain not connected or contracts not deployed.
"""
import os
from typing import Optional
from .client import get_w3, get_addresses, get_agent_ids
from .contracts import get_yield_oracle, get_agent_executor, get_hybrid_vault
try:
    from web3 import Web3
except Exception:
    Web3 = None
# import pyth helpers lazily to avoid requiring httpx at import time

AGENT_PRIVATE_KEY = os.getenv("AGENT_PRIVATE_KEY", "")

# Mantle Sepolia testnet asset addresses
ASSET_ADDRESSES = {
    "USDY": "0xcE265E23aAc349cEf9Fa3CC058062A44080f2289",
    "mETH": "0xD57f88B64611dBf74f87FC40f2F1010320483584",
    "fBTC": "0xbED7ad48984fBb3984F5aF83E176fb9f40dB37cc",
    "mUSD": "0xDf079DB274fAEFfeD10A4a0E5C12f65e1570Cd35",
}


def _get_account():
    w3 = get_w3()
    if not w3 or not AGENT_PRIVATE_KEY:
        return None, None
    try:
        account = w3.eth.account.from_key(AGENT_PRIVATE_KEY)
        return w3, account
    except Exception:
        return None, None


def get_agent_wallet_address() -> Optional[str]:
    """Return the configured autonomous agent signer address."""
    _, account = _get_account()
    return account.address if account else None


def _send(w3, account, fn, gas: int = 400_000, value: int = 0) -> Optional[str]:
    try:
        tx = fn.build_transaction({
            "from":  account.address,
            "nonce": w3.eth.get_transaction_count(account.address),
            "gas":   gas,
            "value": value,
        })
        signed  = account.sign_transaction(tx)
        raw = getattr(signed, "rawTransaction", None) or getattr(signed, "raw_transaction", None)
        tx_hash = w3.eth.send_raw_transaction(raw)
        h = tx_hash.hex()
        return h if h.startswith("0x") else "0x" + h
    except Exception as e:
        print(f"[mantle.executor] tx failed: {e}")
        return None


def _resolve_assets(symbols_or_bps: dict) -> tuple[list, list]:
    """Convert {symbol: bps} → ([addresses], [bps]) filtering zero addresses."""
    assets, apys = [], []
    for symbol, bps in symbols_or_bps.items():
        addr = ASSET_ADDRESSES.get(symbol)
        if addr and addr != "0x" + "0" * 40:
            assets.append(addr)
            apys.append(int(bps))
    return assets, apys


# ── YieldOracle writes ────────────────────────────────────────────

def publish_yield_snapshot(yields: dict, agent_note: str) -> Optional[str]:
    """Write yield data to YieldOracle.updateYields() on Mantle.
    yields: { "USDY": 420, "mETH": 612 }  (bps)
    """
    w3, account = _get_account()
    oracle = get_yield_oracle()
    if not w3 or not account or not oracle:
        return None
    assets, apys = _resolve_assets(yields)
    if not assets:
        return None
    return _send(w3, account, oracle.functions.updateYields(assets, apys, agent_note), gas=300_000)


def publish_market_snapshot(yields: dict, market_summary: str) -> Optional[str]:
    """Write a full market snapshot to YieldOracle.createMarketSnapshot()."""
    w3, account = _get_account()
    oracle = get_yield_oracle()
    if not w3 or not account or not oracle:
        return None
    assets, apys = _resolve_assets(yields)
    if not assets:
        return None
    return _send(w3, account, oracle.functions.createMarketSnapshot(assets, apys, market_summary))


def publish_price_update(symbol: str, agent_note: str) -> Optional[str]:
    """Fetch a Pyth price update from Hermes and store it in YieldOracle.updatePrice()."""
    w3, account = _get_account()
    oracle = get_yield_oracle()
    if not w3 or not account or not oracle:
        return None

    asset = ASSET_ADDRESSES.get(symbol)
    if not asset or asset == "0x" + "0" * 40:
        return None

    try:
        from .pyth import fetch_price_updates
        price_update, _ = fetch_price_updates([symbol])
        if not price_update:
            return None
        fee = oracle.functions.getPythUpdateFee(price_update).call()
        return _send(
            w3,
            account,
            oracle.functions.updatePrice(asset, price_update, agent_note),
            gas=500_000,
            value=int(fee),
        )
    except Exception as e:
        print(f"[mantle.executor] pyth price update failed: {e}")
        return None


# ── AgentExecutor writes ──────────────────────────────────────────

def record_yield_on_executor(yields: dict, summary: str) -> Optional[str]:
    """Call AgentExecutor.recordYieldSnapshot() — stores AI reasoning on-chain."""
    w3, account = _get_account()
    executor = get_agent_executor()
    if not w3 or not account or not executor:
        return None
    assets, apys = _resolve_assets(yields)
    if not assets:
        return None
    agent_id = get_agent_ids().get("yield", 0)
    return _send(w3, account, executor.functions.recordYieldSnapshot(agent_id, assets, apys, summary))


def log_tokenization(asset_id: int, token_address: str, ai_reasoning: str) -> Optional[str]:
    """Nexus: log a tokenization action on AgentExecutor."""
    w3, account = _get_account()
    executor = get_agent_executor()
    if not w3 or not account or not executor:
        return None
    agent_id = get_agent_ids().get("nexus", 0)
    return _send(w3, account, executor.functions.logTokenization(agent_id, asset_id, token_address, ai_reasoning))


def log_compliance_review(asset_id: int, score: int, ai_reasoning: str) -> Optional[str]:
    """Shield: log a compliance review on AgentExecutor."""
    w3, account = _get_account()
    executor = get_agent_executor()
    if not w3 or not account or not executor:
        return None
    agent_id = get_agent_ids().get("shield", 0)
    return _send(w3, account, executor.functions.logComplianceReview(agent_id, asset_id, score, ai_reasoning))


def execute_allocation(user: str, asset_symbols: list[str], amounts_wei: list[int], ai_reasoning: str) -> Optional[str]:
    """Atlas: execute portfolio allocation on AgentExecutor."""
    w3, account = _get_account()
    executor = get_agent_executor()
    if not w3 or not account or not executor:
        return None
    assets = [ASSET_ADDRESSES[s] for s in asset_symbols if s in ASSET_ADDRESSES]
    if not assets:
        return None
    agent_id = get_agent_ids().get("atlas", 0)
    return _send(w3, account, executor.functions.executeAllocation(agent_id, user, assets, amounts_wei, ai_reasoning))


def execute_rebalance(
    user: str,
    from_symbols: list[str],
    to_symbols: list[str],
    amounts_wei: list[int],
    ai_reasoning: str,
) -> Optional[str]:
    """Atlas: execute portfolio rebalance on AgentExecutor."""
    w3, account = _get_account()
    executor = get_agent_executor()
    if not w3 or not account or not executor:
        return None
    from_assets = [ASSET_ADDRESSES[s] for s in from_symbols if s in ASSET_ADDRESSES]
    to_assets   = [ASSET_ADDRESSES[s] for s in to_symbols   if s in ASSET_ADDRESSES]
    if not from_assets:
        return None
    agent_id = get_agent_ids().get("atlas", 0)
    return _send(w3, account, executor.functions.executeRebalance(agent_id, user, from_assets, to_assets, amounts_wei, ai_reasoning))


# ── HybridVault relayer helpers ───────────────────────────────────
def get_agent_consent_typed_data(user: str, agent: str, token: str, amount: int, expiry: int) -> dict:
    """Return EIP-712 typed data dict the user can sign with eth_signTypedData_v4."""
    # Types mirror the contract: AgentConsent(address user,address agent,address token,uint256 amount,uint256 expiry,uint256 nonce)
    w3 = get_w3()
    vault = get_hybrid_vault()
    chain_id = None
    verifying_contract = None
    if w3 and vault:
        try:
            chain_id = w3.eth.chain_id
            verifying_contract = vault.address
        except Exception:
            pass

    nonce = 0
    if vault:
        try:
            nonce = int(vault.functions.nonces(Web3.to_checksum_address(user)).call())
        except Exception:
            nonce = 0

    def _cs(addr: str) -> str:
        if Web3:
            return Web3.to_checksum_address(addr)
        return addr

    message = {
        "user": _cs(user),
        "agent": _cs(agent),
        "token": _cs(token),
        "amount": str(int(amount)),
        "expiry": str(int(expiry)),
        "nonce": str(nonce),
    }

    typed = {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            "AgentConsent": [
                {"name": "user", "type": "address"},
                {"name": "agent", "type": "address"},
                {"name": "token", "type": "address"},
                {"name": "amount", "type": "uint256"},
                {"name": "expiry", "type": "uint256"},
                {"name": "nonce", "type": "uint256"},
            ],
        },
        "primaryType": "AgentConsent",
        "domain": {
            "name": "HybridVault",
            "version": "1",
            "chainId": chain_id or 0,
            "verifyingContract": verifying_contract or "0x0000000000000000000000000000000000000000",
        },
        "message": message,
    }
    return typed


def get_vault_status(user: str, token: str, agent: Optional[str] = None) -> dict:
    """Read HybridVault balance, allowance, nonce, and risk controls."""
    w3 = get_w3()
    vault = get_hybrid_vault()
    agent_addr = agent or get_agent_wallet_address()
    if not w3 or not vault:
        return {
            "available": False,
            "message": "HybridVault is not deployed or Mantle RPC is unavailable.",
        }
    if not agent_addr:
        return {
            "available": False,
            "message": "AGENT_PRIVATE_KEY is not configured.",
        }

    try:
        user_cs = Web3.to_checksum_address(user)
        token_cs = Web3.to_checksum_address(token)
        agent_cs = Web3.to_checksum_address(agent_addr)
        allowance = vault.functions.allowances(user_cs, agent_cs, token_cs).call()
        return {
            "available": True,
            "vault": vault.address,
            "user": user_cs,
            "agent": agent_cs,
            "token": token_cs,
            "balance": str(vault.functions.balances(user_cs, token_cs).call()),
            "nonce": str(vault.functions.nonces(user_cs).call()),
            "approvedAgent": bool(vault.functions.approvedAgents(agent_cs).call()),
            "allowance": {
                "amount": str(allowance[0]),
                "expiry": str(allowance[1]),
                "dailySpent": str(allowance[2]),
                "dailyWindowStart": str(allowance[3]),
            },
            "limits": {
                "perTxCap": str(vault.functions.perTxCap().call()),
                "perAgentDailyCap": str(vault.functions.perAgentDailyCap().call()),
                "perUserPercentCapBps": str(vault.functions.perUserPercentCapBps().call()),
            },
        }
    except Exception as e:
        return {
            "available": False,
            "message": str(e),
        }


def compute_agent_consent_digest(user: str, agent: str, token: str, amount: int, expiry: int, nonce: int) -> Optional[str]:
    """Compute EIP-712 digest matching contract's DOMAIN_SEPARATOR and AgentConsent struct.
    Returns hex digest (0x...)
    """
    w3 = get_w3()
    vault = get_hybrid_vault()
    if not w3 or not vault:
        return None
    try:
        # compute typehash
        type_text = "AgentConsent(address user,address agent,address token,uint256 amount,uint256 expiry,uint256 nonce)"
        type_hash = Web3.keccak(text=type_text)

        # struct hash = keccak(abi.encode(typehash, user, agent, token, amount, expiry, nonce))
        solidity_keccak = Web3.solidity_keccak if hasattr(Web3, "solidity_keccak") else Web3.solidityKeccak
        struct_hash = solidity_keccak(
            ["bytes32", "address", "address", "address", "uint256", "uint256", "uint256"],
            [type_hash, Web3.to_checksum_address(user), Web3.to_checksum_address(agent), Web3.to_checksum_address(token), int(amount), int(expiry), int(nonce)],
        )

        domain_separator = vault.functions.DOMAIN_SEPARATOR().call()
        digest = Web3.keccak(b"\x19\x01" + domain_separator + struct_hash)
        return digest.hex()
    except Exception as e:
        print(f"[mantle.executor] compute digest failed: {e}")
        return None


def relay_set_agent_allowance_by_sig(user: str, agent: str, token: str, amount: int, expiry: int, nonce: int, signature: str) -> Optional[str]:
    """Relayer submits a user-signed AgentConsent to the HybridVault.
    `signature` should be a 0x hex string (65 bytes) produced by the user.
    """
    w3, account = _get_account()
    vault = get_hybrid_vault()
    if not w3 or not account or not vault:
        return None
    try:
        sig_bytes = Web3.to_bytes(hexstr=signature)
        fn = vault.functions.setAgentAllowanceBySig(Web3.to_checksum_address(user), Web3.to_checksum_address(agent), Web3.to_checksum_address(token), int(amount), int(expiry), int(nonce), sig_bytes)
        return _send(w3, account, fn)
    except Exception as e:
        print(f"[mantle.executor] relay setAgentAllowanceBySig failed: {e}")
        return None


def execute_on_behalf(user: str, token: str, to: str, amount: int, data: bytes = b"") -> Optional[str]:
    """Agent (relayer) calls `executeOnBehalf` on HybridVault to move tokens per allowance.
    Caller must be the agent address (account from AGENT_PRIVATE_KEY).
    """
    w3, account = _get_account()
    vault = get_hybrid_vault()
    if not w3 or not account or not vault:
        return None
    try:
        fn = vault.functions.executeOnBehalf(Web3.to_checksum_address(user), Web3.to_checksum_address(token), Web3.to_checksum_address(to), int(amount), data)
        return _send(w3, account, fn)
    except Exception as e:
        print(f"[mantle.executor] executeOnBehalf failed: {e}")
        return None
