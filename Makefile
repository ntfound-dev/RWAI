# RWAi — Makefile
# Usage: make run          ← start everything
#        make stop         ← stop everything
# Run `make help` to see all commands.

.PHONY: help install install-contracts install-agents install-app \
        run dev dev-backend dev-frontend stop \
        compile test preflight deploy verify register sync-deployment production-testnet \
        clean kill-ports

# ── Colours ──────────────────────────────────────────────────────
BOLD  = \033[1m
RESET = \033[0m
GREEN = \033[32m
CYAN  = \033[36m
YELLOW= \033[33m

PYTHON := .venv/bin/python3

# ── Default ───────────────────────────────────────────────────────
.DEFAULT_GOAL := run


# ── Run / Stop ────────────────────────────────────────────────────
run: stop
	@echo "$(BOLD)RWAi — starting$(RESET)"
	@echo "  Backend  → http://localhost:8001"
	@echo "  Frontend → http://localhost:3000"
	@echo "  (backend first start takes ~10s)"
	@echo ""
	@$(PYTHON) -m uvicorn agents.api.app:app \
		--host 0.0.0.0 --port 8001 --reload \
		2>&1 | sed 's/^/[BE] /' & \
	cd app && npm run dev 2>&1 | sed 's/^/[FE] /'

stop:
	@echo "$(YELLOW)▶ Stopping all processes$(RESET)"
	@-pkill -f "uvicorn agents.api.app" 2>/dev/null || true
	@-pkill -f "next dev" 2>/dev/null || true
	@-lsof -t -i:8001 | xargs kill -9 2>/dev/null || true
	@-lsof -t -i:3000  | xargs kill -9 2>/dev/null || true
	@echo "$(GREEN)✓ Stopped$(RESET)"

dev: run
kill-ports: stop


# ── Separate starts ───────────────────────────────────────────────
dev-backend:
	@echo "$(YELLOW)▶ FastAPI backend on :8001$(RESET)"
	$(PYTHON) -m uvicorn agents.api.app:app --host 0.0.0.0 --port 8001 --reload

dev-frontend:
	@echo "$(YELLOW)▶ Next.js on :3000$(RESET)"
	cd app && npm run dev


# ── Help ──────────────────────────────────────────────────────────
help:
	@echo ""
	@echo "$(BOLD)RWAi — available commands$(RESET)"
	@echo ""
	@echo "  $(CYAN)make run$(RESET)              Start backend (:8001) + frontend (:3000)  ← main"
	@echo "  $(CYAN)make stop$(RESET)             Stop all background processes"
	@echo "  $(CYAN)make dev-backend$(RESET)      Start FastAPI backend only"
	@echo "  $(CYAN)make dev-frontend$(RESET)     Start Next.js frontend only"
	@echo "  $(CYAN)make install$(RESET)          Install all dependencies"
	@echo ""
	@echo "  $(CYAN)make compile$(RESET)          Compile Solidity contracts"
	@echo "  $(CYAN)make test$(RESET)             Run contract tests"
	@echo "  $(CYAN)make deploy$(RESET)           Deploy contracts to Mantle Sepolia"
	@echo "  $(CYAN)make verify$(RESET)           Verify contracts on Mantlescan"
	@echo "  $(CYAN)make register$(RESET)         Register 4 ERC-8004 agent identities"
	@echo "  $(CYAN)make sync-deployment$(RESET)  Sync deployments.json → app + backend"
	@echo "  $(CYAN)make production-testnet$(RESET) Full deploy flow (test→deploy→register→verify→sync)"
	@echo ""
	@echo "  $(CYAN)make clean$(RESET)            Remove build artifacts"
	@echo ""


# ── Install ───────────────────────────────────────────────────────
install: install-contracts install-agents install-app
	@echo "$(GREEN)✓ All dependencies installed$(RESET)"

install-contracts:
	@echo "$(YELLOW)▶ contracts — npm install$(RESET)"
	cd contracts && npm install

install-agents:
	@echo "$(YELLOW)▶ agents — pip install into .venv$(RESET)"
	python3 -m venv .venv
	.venv/bin/pip install -r agents/requirements.txt

install-app:
	@echo "$(YELLOW)▶ app — npm install$(RESET)"
	cd app && npm install


# ── Contracts ─────────────────────────────────────────────────────
compile:
	@echo "$(YELLOW)▶ Compiling contracts$(RESET)"
	cd contracts && npx hardhat compile

test:
	@echo "$(YELLOW)▶ Running contract tests$(RESET)"
	cd contracts && npx hardhat test

preflight:
	@echo "$(YELLOW)▶ Checking Mantle Sepolia readiness$(RESET)"
	cd contracts && npm run preflight:sepolia

deploy:
	@echo "$(YELLOW)▶ Deploying to Mantle Sepolia (chainId 5003)$(RESET)"
	cd contracts && npx hardhat run scripts/deploy.ts --network mantleSepolia
	@echo "$(GREEN)✓ Deployments saved to contracts/deployments.json$(RESET)"
	@echo "$(YELLOW)  Next: make register && make sync-deployment$(RESET)"

verify:
	@echo "$(YELLOW)▶ Verifying on Mantlescan$(RESET)"
	cd contracts && npx hardhat run scripts/verify.ts --network mantleSepolia

register:
	@echo "$(YELLOW)▶ Registering ERC-8004 agent identities$(RESET)"
	cd contracts && npx hardhat run scripts/registerAgents.ts --network mantleSepolia
	@echo "$(GREEN)✓ Agent IDs saved to contracts/deployments.json$(RESET)"

sync-deployment:
	@echo "$(YELLOW)▶ Syncing deployment manifest$(RESET)"
	cd contracts && npm run sync:deployment
	@echo "$(GREEN)✓ Deployment config synced$(RESET)"

production-testnet: test preflight deploy register verify sync-deployment
	@echo "$(GREEN)✓ Mantle Sepolia production-testnet flow complete$(RESET)"


# ── Utilities ─────────────────────────────────────────────────────
clean:
	@echo "$(YELLOW)▶ Cleaning build artifacts$(RESET)"
	rm -rf contracts/node_modules contracts/artifacts contracts/cache contracts/typechain-types
	rm -rf app/node_modules app/.next
	find agents -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find agents -name "*.pyc" -delete 2>/dev/null || true
	@echo "$(GREEN)✓ Clean$(RESET)"
