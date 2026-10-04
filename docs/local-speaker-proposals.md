# Optional local anonymous speaker proposals

This CPU CLI processes a complete recording locally with public SpeechBrain ECAPA embeddings, Silero VAD and global cosine clustering. It downloads public model weights; it never uploads recordings, source text or embeddings. It produces review artifacts and a `source.diarization.apply` operation without modifying the source or calling the app API.

Use Python 3.12 and an installed `ffmpeg` binary. The pinned packages below match the environment used for real complete-recording runs. They are optional and separate from the transcription gateway requirements.

```sh
python3.12 -m venv /tmp/qualityer-speakers
/tmp/qualityer-speakers/bin/python -m pip install -r scripts/requirements-local-speakers.txt
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=4 /tmp/qualityer-speakers/bin/python \
  scripts/local-speaker-proposals.py \
  --audio /absolute/path/recording.m4a \
  --source-json /absolute/path/canonical-transcript.json \
  --output-dir /absolute/path/private-speaker-run
```

`--source-json` accepts the app's canonical JSON transcript export, a complete document object, or a project snapshot. For a snapshot containing several documents, add `--source-id` with the actual source ID. The source must retain exact text, current revision, actual turn IDs and codepoint/time anchors, media key/type, `attributes["Source SHA-256"]`, and matched alignment with the same recording key. Raw Whisper/ASR segments cannot invent current app IDs and are rejected. Audio bytes must match the recorded SHA-256. Turn anchors and any supplied turn text are checked against the unchanged canonical text; a declared text hash is checked when supplied, and the exact text hash is always recorded. Applying later still requires the app to validate the live source revision and recording.

If using `uv` instead of pip, pass `--index-strategy unsafe-best-match` when installing this requirements file. These exact pins use the explicitly configured PyPI and public PyTorch CPU indexes; uv's default first-index rule otherwise hides the pinned NumPy version behind the PyTorch index.

The model is pinned to `speechbrain/spkrec-ecapa-voxceleb` revision `0f99f2d0ebe89ac095bcc5903c4dd8f72b367286`. Model bytes, packaged VAD weights, dependency versions, algorithm parameters and script hash are recorded. Each output directory belongs to one recording/model/embedding configuration. `--recluster` reuses complete verified cache metadata and embeddings; use a new directory if the recording, model or extraction parameters change. The default duration limit is four hours, configurable with `--max-audio-seconds`; global clustering also rejects more than 12,000 windows rather than attempting unbounded pairwise work.

The method tests counts 2–8 and retains alternatives. It selects an acoustic hypothesis by cosine silhouette and material support, withholds small candidates individually, then requires duration, centroid margin/distance and hierarchy agreement. Count selection is an unvalidated heuristic: three clusters do not establish three people. Stable labels are anonymous `Speaker N` values within a recording/run, with no names, roles or identity links inferred. Relative margins are not calibrated confidence probabilities.

VAD runs are partitioned into non-intersecting estimated intervals. No overlap detector, word alignment or verified speaker-boundary model ran. Mapping to each actual source turn requires at least 60% accepted acoustic coverage, 92% dominance, 0.60 accepted seconds and at most 0.20 seconds from another accepted cluster. Coverage is accepted interval overlap divided by source-turn duration; dominance is the largest label overlap divided by all accepted overlap. Unknown intervals are excluded from these ratios. A proposed dominant whole-ASR-turn label may therefore still contain unresolved material; researcher listening review remains necessary. Short, weak, mixed or uncovered decisions stay `Unassigned`.

Outputs include `speaker-proposal.json`, `apply-operation.json`, `window-diagnostics.json`, `alternative-clusterings.json`, `pipeline-provenance.json`, VAD runs and cached embeddings/decoded audio. The application operation contains compact domain fields; the detailed acoustic diagnostics remain separate. All output files are private local artifacts. The app rejects stale/mismatched sources and replacement of recorded researcher speaker decisions. Processing authorization does not establish participant publication consent.

Real complete-recording inference and mechanical checks established that the pipeline runs and its reported overlap metrics match its intervals. They did not establish listening-verified diarization accuracy, participant identities or human review.

Run `scripts/local-speaker-proposals.py --self-test` with the configured Python to check canonical export/document normalization, Unicode anchors, invalid-input rejection and automatic clustering with a tiny candidate withheld. This synthetic check performs no download or audio inference and does not measure diarization accuracy.
