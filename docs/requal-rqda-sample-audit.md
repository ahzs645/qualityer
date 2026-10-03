# Requal and related RQDA public-example audit

This audit inspects immutable public repository examples and runs local SQLite adapters. It does not claim an R/Shiny application runtime test. Uploaded private interview material was not used or redistributed.

| Sample | Provenance | Scope actually verified |
|---|---|---|
| `test_basic.requal` and `test_basic_backup.requal` | Direct `RE-QDA/requal` commit `dd266149b291aec3df13ca29ba3ef6ff7458aeae`, `tests/`; MIT repository | Identical 106,496-byte databases, SHA-256 `dcbe912c84f5cc6b7ce906ecbf9cb1d04c501c43b1bb13d15d70a586d8afc8e7`. One empty project; zero documents, codes, segments, memos and cases. Native schema read, ignored account/permission/log tables, unchanged bytes verified. |
| `stakeholders.rqda` | Related workshop, `YuxiaoLuo/RQDA-Workshop` commit `5ff4879187264958f0fe4399179b508169378818`, `R script/stakeholders.rqda` | 328,704 bytes; SHA-256 `e8117b8ccdd98fc9ff732f929cb395559fd251286a7356a53a00e7f6f9e14db1`. Populated RQDA 0.2.2 project. This is not a direct Requal native example. No redistribution license located; database remains local verification material. |

Immutable downloads:
- https://raw.githubusercontent.com/RE-QDA/requal/dd266149b291aec3df13ca29ba3ef6ff7458aeae/tests/test_basic.requal
- https://raw.githubusercontent.com/RE-QDA/requal/dd266149b291aec3df13ca29ba3ef6ff7458aeae/tests/test_basic_backup.requal
- https://raw.githubusercontent.com/YuxiaoLuo/RQDA-Workshop/5ff4879187264958f0fe4399179b508169378818/R%20script/stakeholders.rqda

The direct Requal project was unsupported by the previous native schema matcher. A new independent allowlist adapter reads Requal's native tables without importing account identities, login/email/password fields, permissions or audit payloads. It preserves exact source Unicode, descriptions, historical user IDs, coding, case membership, categories, memos and source/case attribute values. Native one-based inclusive bounds become zero-based exclusive codepoint anchors only for verified versions and exact stored quotations. Unknown versions, ambiguous version records and stale quoted text remain quarantined. Multiple category or memo targets remain explicit provenance rather than arbitrary active links.

Version contracts were checked against Requal's `get_segment_text` implementation using R `substr(start, stop)` at current commit and v1.0.0 commit `ae6fb8eb8d4b5634a7978036b5cfa8e7fbb08877`. The committed empty fixture reports version 1.0.0. Populated regression fixtures are independently synthetic, following the documented schema; they are not represented as upstream runtime-generated databases. The upstream Shiny add-segment test creates a Lorem Ipsum document at runtime and selects positions 619–623. Its RQDA migration test file is entirely commented out.

The real RQDA workshop project exposed a source-preservation bug in SQL.js. Its normal text reader removes a leading U+FEFF; source 5 shrank from 17,496 to 17,495 codepoints and 83 otherwise valid anchors were withheld. Reading allowlisted SQLite TEXT as bytes, preserving native encoding and decoding with `ignoreBOM:true`, restores exact source text. Independent synthetic tests also cover embedded NUL, CRLF, emoji and combining characters across UTF-8/UTF-16 little/big endian, invalid text rejection, real BLOB preservation and identifier escaping.

After the fix, the RQDA sample imports 6 active sources, 40 active codes, 473 eligible applications, 8 active categories, 1 active case, 3 coding memos, 32 category memberships and 5 case links. Of the applications, 414 match exact stored source slices and become active; 59 retain the original quotation/bounds but remain quarantined. Native historical owner fields and coding memo text match their SQL records. Source bytes and every input database remain unchanged. An unknown-version variant withholds every coding and case bound.

The RQDA file also contains unsupported file categories, one attribute definition and eight point annotations. Those remain declared migration losses. There is no claim of complete native round trips, populated Requal runtime compatibility or support for every historical schema. Public reports contain metadata only; downloaded native files and transcript content are not bundled with the app.

Twelve focused tests passed. See the integration handoff for the immutable adapter and shared SQLite text helper.

Final actual file-picker browser rehearsal passed eight workflows, including preview cancellation, exact BOM source persistence, JSON/QDPX exports and reimports, and the committed empty Requal project. No external requests or page errors; original bytes unchanged.
