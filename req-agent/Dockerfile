FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent/ ./agent/
COPY api/ ./api/
COPY cli/ ./cli/
COPY main.py .

RUN mkdir -p data output

CMD ["python", "main.py"]
