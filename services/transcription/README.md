# Team-controlled recording worker

This is a separate Python service used by Research Weave's durable job routes. The Site itself does not run inference. The API/queue and real ffmpeg decoding have been tested; WhisperX/pyannote inference and this Docker image have not been executed in the current environment, which cannot access/install the needed models.

Build and run on your approved host with persistent storage and HTTPS ingress:

```sh
docker build -t research-weave-audio .
docker run --rm -p 8000:8000 -v research-weave-audio:/data \
  -e AUDIO_WORKER_TOKEN -e HF_TOKEN \
  -e WHISPER_MODEL=small -e WHISPER_DEVICE=cpu \
  research-weave-audio
```

Supply AUDIO_WORKER_TOKEN through your host's secret manager (at least 24 random characters). Enter the same token and approved HTTPS worker URL in the app's Connections & protocol. Model files and durable queue/input data live on /data. Configure AUDIO_RETENTION_SECONDS (default seven days). The worker purges expired inputs/results; completed transcripts already imported into a project remain research records.

Optional HF_TOKEN is required for diarization and the team must separately accept the chosen model's terms. CPU int8 is the default; a GPU deployment requires the appropriate host drivers/container runtime and dependency-compatible image. Choose WHISPER_MODEL, WHISPER_DEVICE, WHISPER_COMPUTE_TYPE and WHISPER_BATCH_SIZE for your host. Installing an application license does not grant model access.

The protocol is authenticated POST /jobs?project_id=…&job_id=…&diarize=true|false with a streamed recording and matching Idempotency-Key, GET /jobs/{id}?project_id=…, and DELETE at the same scoped URL. A submit acknowledgement uses the same durable job UUID; an interrupted acknowledgement can be reconciled by polling it. Completed status returns {result:{segments:[{text,start,end,speaker?,words?}],model,engine,language,diarization}}. WhisperX word timestamps are retained in the app's transcript turns.

The adapter normalizes and checks the complete recording, then transcribes/aligns 20-minute parts. When requested, a single WhisperX 3.8.0 diarizer processes the complete recording before every chunk is shifted to absolute seconds and assigned against the same global speaker track. Default diarization gates are two hours and a 512 MB float32 waveform budget (excluding model/intermediate memory); longer transcription-only jobs remain available up to the configurable 12-hour recording limit. See ../../docs/audio-speaker-completion.md for resource and missing-timing contracts. Human naming, transcription correction and attribution checks remain part of the workflow.

Run gateway/queue checks without downloading models (httpx is a test dependency):

```sh
python -m unittest discover -s . -p 'test_*.py' -v
```

The standard-library queue_store.py includes a WAV-only proof HTTP handler used by queue tests. Production uses app.py's streamed FastAPI routes. Deploy only app:app behind HTTPS; no test/mock engine is present in the production adapter.

## Result integrity and model orchestration

Generated segments/words are validated at the queue and app boundaries. Numeric seconds must be finite, nonnegative and ordered; missing/null times remain missing, and zero/fractional/overlapping bounds are retained. The adapter reloads language-specific alignment when detected language changes and records chunk language/offset provenance. The container disables pyannote metrics and Hugging Face telemetry by default; actual model execution/network behavior still requires host verification. Run `python -m unittest discover -s services/transcription -p "test_*.py"` from the repository root for synthetic service checks. These checks do not measure transcription or diarization accuracy.
