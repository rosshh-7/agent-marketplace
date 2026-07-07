FROM python:3.12-slim

WORKDIR /app

# docker CLI/daemon client libs need nothing extra — the `docker` python package talks
# to the host daemon over the mounted socket, no docker-in-docker install needed here.

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY review_cli.py .

RUN mkdir -p /data

ENV REVIEW_AGENT_DATA_DIR=/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
