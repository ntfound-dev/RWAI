FROM python:3.11-slim

WORKDIR /app

# Install Python deps from agents/requirements.txt
COPY agents/requirements.txt /app/agents/requirements.txt
RUN pip install --no-cache-dir -r /app/agents/requirements.txt

# Copy agent source code and contracts deployments
COPY agents/ /app/agents/
COPY contracts/deployments.json /app/contracts/deployments.json

ENV PYTHONPATH=/app
ENV RWAI_DEPLOYMENTS_FILE=/app/contracts/deployments.json

EXPOSE 8001

CMD ["uvicorn", "agents.api.app:app", "--host", "0.0.0.0", "--port", "8001"]
