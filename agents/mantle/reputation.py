"""
Read agent reputation scores from AgentReputationManager.sol on Mantle.
Returns sensible defaults when chain is not connected or contracts not yet deployed.
"""
from .contracts import get_agent_reputation
from .client import get_agent_ids

_AGENT_NAMES = ["nexus", "shield", "yield", "atlas"]

_DEFAULTS = {
    "nexus":  {"localScore": 75, "actionCount": 0, "autonomyLevel": 3},
    "shield": {"localScore": 75, "actionCount": 0, "autonomyLevel": 3},
    "yield":  {"localScore": 75, "actionCount": 0, "autonomyLevel": 3},
    "atlas":  {"localScore": 75, "actionCount": 0, "autonomyLevel": 3},
}


def get_agent_reputation_scores() -> dict:
    """Return {agent_name: {localScore, actionCount, autonomyLevel}} for all 4 agents."""
    rm = get_agent_reputation()
    agent_ids = get_agent_ids()
    result = {}

    for name in _AGENT_NAMES:
        agent_id = agent_ids.get(name, 0)
        if rm and agent_id:
            try:
                score   = rm.functions.localScore(agent_id).call()
                count   = rm.functions.actionCount(agent_id).call()
                level   = rm.functions.getAutonomyLevel(agent_id).call()
                result[name] = {"localScore": score, "actionCount": count, "autonomyLevel": level}
                continue
            except Exception:
                pass
        result[name] = dict(_DEFAULTS[name])

    return result


def get_one(agent_name: str) -> dict:
    """Return reputation for a single agent."""
    return get_agent_reputation_scores().get(agent_name, dict(_DEFAULTS.get(agent_name, {})))
