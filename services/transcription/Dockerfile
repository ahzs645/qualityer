FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 && rm -rf /var/lib/apt/lists/*
WORKDIR /service
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./
ENV AUDIO_DATA_DIR=/data HF_HOME=/data/models WHISPER_DEVICE=cpu WHISPER_COMPUTE_TYPE=int8 PYANNOTE_METRICS_ENABLED=0 HF_HUB_DISABLE_TELEMETRY=1
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
