# Transcript coding and interview-results interface verification

This pass checks the coding journey on a real built application with its private API, using disposable copies of the uploaded interview. It does not replace a researcher usability study. The original private interview and prior coding remain unchanged.

## Changes delivered

- Original speaker-turn and source-line navigation, with previous/next controls inside the passage drawer. Source lines use original newline boundaries; responsive visual wrapping has no effect on saved offsets.
- Exact cross-turn/cross-line range selection using Unicode codepoint boundaries and a quotation preview. Multiple codes can be assigned to the same range, with separate coder attribution.
- Browser selection-change capture and an explicit **Use highlighted text** confirmation. Desktop pointer and keyboard selection remain supported. Touch handle changes no longer rely on mouse events.
- A collapsible phone codebook and a bounded passage drawer. Selected source text scrolls into the visible reading area above the drawer; the narrow-screen navigator collapses while its previous/next controls remain available in the drawer. Close the drawer to make another native selection.
- Source/revision-bound drafts. Switching the displayed source clears the selected draft. A changed source revision or quotation disables coding, and the server refuses a stale draft even when submitted directly. Same-text transcript replacement carries exact current coding revisions forward without promoting stale records.
- A modular **Interview overview** in Visualizations, linking descriptive metrics and code definitions to exact quotations, dialogue context, researcher-written interpretations and supporting/contrasting citations.
- Counts and coverage explicitly distinguish applications, distinct ranges and overlapping text coverage. Consent-review ranges and stale anchors are excluded. Speaker word shares use complete eligible turns; word frequency uses the same eligible-token rules as its quotation lookup.

## Verified journeys

Desktop Chromium at 1440×1000, touch-emulated phone at 390×844, and touch-emulated tablet at 768×1024 exercised whole-turn selection, two-code assignment, linked passage memo, sequential navigation, cross-turn range selection, confirmation of a browser-selection draft, and reopening saved decisions. The phone additionally exercised its collapsible codebook. Source text remains visible above the narrow-screen drawer, and all three layouts fit their viewport without page-level horizontal overflow.

A separate desktop mouse rehearsal selected an emoji with a real drag, saved its exact single-codepoint anchor, switched sources without retaining the old draft, and navigated original source lines. A direct API rehearsal rejected a changed-source draft without writing.

The interview overview was exercised at desktop and phone sizes: exact initial metrics, status and speaker filters, keyboard quotation selection, source navigation and return, and theme reading. A disposable analytical memo with one supporting and one contrasting citation persisted and appeared in the overview. Controls were at least 44 pixels tall in the phone overview; no browser runtime errors were recorded.

The initial private interview contains 302 supplied turns and 33 provisional code applications on 24 distinct ranges. Those original records remain intact. The overview shows 5,616 covered / 82,815 eligible codepoints (6.8% rounded), 15,466 words across 286 complete eligible turns, no accepted decisions, and no usable supplied timestamps. These are descriptive scope statistics, not research findings. No timestamps, participant identities, speech durations or interpretations were inferred.

**Automated validation:** 257 private Node checks; the public sanitized source runs 235 Node checks. Worker and GitHub Pages builds are checked separately. The existing Python transcription contracts are unchanged and run in GitHub Actions.

## Practical limits

Phone and tablet testing used Chromium touch emulation and the browser selection API. Native iOS Safari and Android selection handles, on-screen keyboards and assistive technologies still need real-device testing. No participant usability study has been performed. Desktop is the recommended surface for intensive first-pass coding; mobile supports focused coding and review with explicit navigation and exact-range fallback.

The app does not determine an appropriate qualitative method or derive a finding from code frequency. Read [the workflow comparison](mobile-desktop-coding-workflow-audit.md) and [the results methodology](interview-results-methodology.md) for the differences between coding, thematic interpretation, framework matrices, coder comparison and evidence-linked reporting.
