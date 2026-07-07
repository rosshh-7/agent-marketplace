FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agentmarket_sdk ./agentmarket_sdk
COPY agent.py tools.py prompts.py ./

RUN mkdir -p /outputs /workspace

CMD ["python", "agent.py"]
