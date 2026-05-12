"""Demo script to build EIP-712 typed data for AgentConsent and show payload.

Usage: PYTHONPATH=. python3 agents/mantle/demo_relayer.py
"""
import json
from .executor import get_agent_consent_typed_data


def main():
    # example addresses (replace with real addresses when using live)
    user = "0x1111111111111111111111111111111111111111"
    agent = "0x2222222222222222222222222222222222222222"
    token = "0x0000000000000000000000000000000000000000"
    amount = 0
    expiry = 0

    typed = get_agent_consent_typed_data(user, agent, token, amount, expiry)
    print(json.dumps(typed, indent=2))


if __name__ == "__main__":
    main()
