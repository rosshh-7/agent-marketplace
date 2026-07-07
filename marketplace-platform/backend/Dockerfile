FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Directories the backend reads/writes at runtime. /outputs is the identity-bind-mount
# path shared with worker containers (see app/config.py::OUTPUTS_DIR) — the Docker Agent's
# compose pass is expected to bind-mount a real host directory here at the *same* absolute
# path it uses for worker containers' /outputs mount, and to mount /var/run/docker.sock so
# this container can launch worker containers via the Python `docker` SDK.
RUN mkdir -p /outputs /submissions /previews

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
