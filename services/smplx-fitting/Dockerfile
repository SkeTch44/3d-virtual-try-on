FROM python:3.11-slim

WORKDIR /app

# System deps for trimesh/shapely
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgeos-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# SMPL-X model files are license-gated and must be mounted at runtime:
#   docker run -v $(pwd)/models:/app/models ...
ENV SMPLX_MODEL_DIR=/app/models/smplx
ENV PORT=8000

EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
