# Interview results: descriptive evidence and qualitative interpretation

The Visualizations page opens with a modular Interview overview. It combines code-to-quotation exploration, coding decision state, eligible text coverage and saved researcher readings. Source and supplied-speaker filters apply to evidence as well as counts. The existing theme reading sheet remains the place to develop an analytical memo with supporting and contrasting citations.

## What each metric means

| Metric | Meaning and denominator |
| --- | --- |
| Code applications | Saved current text coding decisions in the selected source, speaker and coding layer. Several codes or coders on one quotation count separately. |
| Distinct quotation ranges | Unique source/start/end codepoint ranges, independent of code and coder. Different boundaries remain different excerpts. |
| Eligible text covered | Union of coded codepoints divided by eligible codepoints in the selected source/speaker range. Overlapping coding counts once. Consent flags are subtracted from the denominator. |
| Coding decision state | Provisional, coded, accepted and flagged application counts across the chosen source/speaker scope, before the coding-layer filter. These buttons change the selected layer. |
| Saved analytical readings | Researcher-written theme-reading memos whose complete citation set is current, unrestricted and inside the selected source/speaker scope, and whose code has selected evidence. |
| Contrasting citations | Saved citation references explicitly designated as counterpoints. This describes recorded analytic work; zero does not establish an absence of contrary evidence. |

Speaker-scoped application counts include a whole quotation when it overlaps a current turn with that supplied label. Coverage clips the quotation to that label's eligible turn ranges. This preserves the stored quote and explains why application counts and coverage answer different questions. Supplied labels are not verified participant identities. A quotation can overlap several speaker labels; their application counts must not be added as independent observations.

Source structure counts above the tabs continue to describe the full selected source. Their coverage label explicitly states that its denominator is the full source. The Interview overview separately explains its eligible, speaker-scoped denominator. Speaker word shares use complete unrestricted turns only; flagged turns are excluded. Draft reports label full-source totals separately from eligible turns and words in the selected speaker scope. Word counts are transcript word counts, not speaking time. The overview never interpolates timestamps or derives speaking duration from words or character positions.

## Methodological use

Use the code definition, exact quotation and surrounding dialogue together. The code list orders excerpts by count to make navigation predictable; it does not rank thematic importance. The same quotation shows every saved code decision in the current layer, along with historical coder attribution and coding memos. Opening the source uses its unchanged codepoint anchor.

Move from description to interpretation by writing a theme-reading memo: explain the proposed pattern, its context, qualifications, counterexamples and the next comparison needed. An accepted coding decision confirms a researcher's decision about a passage, not the truth of a participant's claim. Saved interpretations are attributed to their authors. This overview does not produce automatic sentiment, causal explanations, consensus, saturation or statistically significant findings.

These controls support a researcher's chosen approach, including thematic reading and case comparison. They do not independently establish that a reflexive thematic analysis, grounded theory study or framework analysis has been completed. A single interview provides evidence for within-interview interpretation; cross-case claims require relevant additional cases and a documented comparison. Agent-prepared examples are not independent human coder agreement measurements.

## Anchor and consent safeguards

The shared visualization predicate now excludes deleted, stale, wrong-text and consent-flagged quotations from counts, charts, evidence and draft exports. Active text quotes must exactly match the current Unicode codepoint source range and revision. Non-text media selections are outside this interview text overview. Speaker matching uses valid current turn bounds. Surrounding consent-flagged dialogue is withheld from the inline context, while the private source workspace remains available for review.

## Private example verification

The untouched uploaded interview demo has 33 provisional code applications across 24 distinct ranges and eight codes. Their union covers 5,616 of 82,815 eligible codepoints, or 6.78%. Eligible transcript structure comprises 15,466 words and 286 complete unrestricted turns. It has no supplied usable timestamps, accepted coding decisions or saved analytical readings. These are descriptive demonstration counts, not findings. Original text, labels, timestamps and coding records are unchanged by computing or navigating the overview. No original interview names, quotations or raw records are included in this report.

Eight new domain tests exercise Unicode coverage, duplicate decisions, speaker clipping, coding-layer scope, rejected anchors, complete citation scope and the unchanged private example. Existing visualization and map/coverage tests also pass. The new scoped CSS uses stacking layouts and 44-pixel controls for narrow screens; actual mobile and desktop browser verification is reported separately after the app build.
