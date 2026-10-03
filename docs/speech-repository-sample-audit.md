# Speech repository sample audit

WhisperX and pyannote.audio are speech-processing components, not qualitative-analysis project formats. This audit tests supplied transcript and diarization data plus actual file decoding; it does not import their model pipelines as QDA projects.

## Upstream revisions and licensing

- WhisperX v3.8.0: `6187d25a440e6aba916995b01ff5a4d3af894045`; BSD-2-Clause repository license.
- pyannote.audio: `b749285c5cdd4636b2edc7f766f1352c8dde9369`; MIT repository license.
- Underlying public sample audio/transcript distribution terms were not independently established. Fixtures and generated writer outputs stay in the local audit workspace; no audio, transcripts or copied writer code are vendored into the application.

## Hands-on results

pyannote supplies a 13-turn STM transcript, 10 regular RTTM intervals with six overlap regions, and a 30-second WAV. RTTM import/export preserved every interval and raw label; exclusive-track import correctly rejected overlapping regular annotations. Its debug training RTTM contains 77 intervals across ten recording IDs, including Unicode speaker identifiers. Each recording imported independently after strict UTF-8 decoding; mixing all recording IDs in one recording-bound import correctly failed. The Unicode filename `trñ00.wav` also decoded successfully.

WhisperX contains no committed JSON/subtitle/TSV/audio output fixture at the audited tag. The audit executed its exact upstream writer classes from `whisperx/utils.py` on the supplied pyannote STM segments, without loading any model. The resulting JSON/SRT/VTT/TSV each retained all 13 supplied times. JSON and explicit `[speaker]:` subtitle markers retained supplied speaker labels. WhisperX TSV declares integer milliseconds and intentionally omits speaker labels; those remain unassigned rather than reconstructed.

Actual ffmpeg normalized both supplied WAVs to mono 16 kHz PCM16 and split each into three parts with exact total coverage. Durations were 30.0 and 30.0000625 seconds. This verifies decoding and filesystem/Unicode handling; it does not establish model inference accuracy or speaker identity.

## Adapter changes

The modular speech source adapter accepts STM, strict WhisperX millisecond TSV and the application’s corrected transcript TSV with explicit second columns. It preserves zero, fractions, missing timing, supplied labels, original labels and raw source text. Subtitle imports recover only explicit bracket speaker markers, retain raw cue text/settings and ignore VTT NOTE/STYLE/REGION blocks. A colon in ordinary prose does not establish a speaker. JSON remains the richer format for word timing, confidence and recording/run metadata. Supplied STM names and RTTM IDs are independent annotations and require researcher mapping; they are not automatically equated.

The source-file glue should decode using the chosen original encoding and attach file SHA-256, byte length, detected encoding and BOM information. Raw source text retains decoded formatting; original encoded bytes are not represented as retained unless separately stored by the application.

Five synthetic regression tests pass, alongside the actual upstream fixture checks above. No private interview content, credentials or model download was involved.

## SHA-256 provenance

| Upstream path | Bytes | SHA-256 |
|---|---:|---|
| `whisperx-upstream/whisperx/utils.py` | 15667 | `08245c526944d40763542bd32dd6f91b22d543e1161d55b1a0be095e1aeb969c` |
| `whisperx-upstream/LICENSE` | 1297 | `cddc25bce26226b4a04ed12839d9006b7a4403da9020ef6428ef7282a6567441` |
| `pyannote-upstream/LICENSE` | 1061 | `a3b53644a76e70e289b25271b119c0a1aadaaf0db7a16225fb494fdc0e36c32a` |
| `pyannote-upstream/src/pyannote/audio/sample/sample.stm` | 788 | `f861f3004927e1c4429199f9695bfd252def75d7d5e4bdf735d3d85fd4a667f7` |
| `pyannote-upstream/src/pyannote/audio/sample/sample.rttm` | 596 | `d78fe62c69d8e6dcbb42c26adfce83faccb374c5a1e6d987fe37f85f1c173c87` |
| `pyannote-upstream/src/pyannote/audio/sample/sample.wav` | 960104 | `c319b4abca767b124e41432d364fd7df006cb26bb79d09326c487d606a134e6e` |
| `pyannote-upstream/tests/data/debug.train.rttm` | 4303 | `972ee04414fc7644f26eabe1909d6a0f6a3fa57ab840719ec0112d26f3a957d5` |
| `pyannote-upstream/tests/data/trñ00.wav` | 1920062 | `2b0ac2846b90199cf0fdaef0c38c26e965651f2fee29e7af13a30a5b84218142` |

Final actual app file-picker checks passed all five transcript formats (48 assertions), including STM MIME precedence, with thirteen supplied turns each and exact native persistence/export. Original public WAV upload/fetch and transcript-bound RTTM correction/export passed 22 assertions: ten regular intervals, six overlap regions, original media digest and source history preserved; no inference executed.

A fresh audio-only File import also passed 15 checks: the speaker workbench appeared with zero transcript turns, RTTM preview saved nothing, confirmation bound ten intervals and six overlap regions to the recording, and transcript text/turns/alignment stayed unchanged. Total actual speech/media browser assertions: 85.
