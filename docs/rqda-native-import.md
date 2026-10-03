# Native RQDA migration

Research Weave imports a native RQDA SQLite database as a separate study. This is a one-way migration. Native RQDA export and an R/RQDA/Requal runtime round trip have not been verified.

Schema detection checks the `project`, `source`, `freecode` and `coding` tables and their required columns. Exactly one project metadata record is required. The adapter reads explicit research columns; application settings, executable SQL, user permissions, shared paths and image-directory settings are never imported.

Only records whose `status` is 1 become active research records. Supported records include source text and memos, free-code definitions, original coding owners and coding memos, case definitions and passage links, categories and code-category memberships, and journals. The original `coding2` layer is also supported when its documented schema is present. Historical owner fields do not establish independent blind coding or give those owners access to the new study.

## Original offset contract

The verified contract covers RQDA database version `0.2.2`:

- [RQDA creates the native schema](https://github.com/Ronggui/RQDA/blob/b3d09c0bcdbcf14da969d4092b792a5b8a0f3bd9/R/ProjectFun.R#L34), including `selfirst` and `selend` and a `0.2.2` database version record.
- [RQDA captures selection positions](https://github.com/Ronggui/RQDA/blob/b3d09c0bcdbcf14da969d4092b792a5b8a0f3bd9/R/CodesFun.R#L148) through `gtkTextIterGetOffset`.
- [RQDA reconstructs selected text](https://github.com/Ronggui/RQDA/blob/b3d09c0bcdbcf14da969d4092b792a5b8a0f3bd9/R/utils.R#L627) with `substr(source.file,coding.selfirst+1,coding.selend-coding.selfirst)`, establishing zero-based Unicode character bounds with an exclusive end.

A stored `seltext` must match the source exactly at those bounds. If selected text is absent, a current source slice is activated only for the documented version and valid bounds, with that derivation recorded explicitly. Unknown versions, fractional or invalid bounds, and mismatched quotations remain `needs_review`. The importer never rounds offsets, guesses UTF-8/UTF-16 units, searches for replacement quotations or silently reanchors a selection.

Partial case links remain passage-specific. A case link becomes a whole-source membership only when documented bounds cover the complete source. Missing or unverified case bounds remain inert provenance. Several code-category memberships are preserved in provenance when the target codebook cannot represent all of them directly; the importer does not duplicate the code or arbitrarily pick one category.

[Requal's RQDA migration](https://github.com/RE-QDA/requal/blob/dd266149b291aec3df13ca29ba3ef6ff7458aeae/R/import_rqda.R#L54) documents the same main tables and source/code/case/category description mappings. Its current importer copies selection positions into its own substring operation, while its sample migration tests are commented out. Research Weave follows the original RQDA position contract and does not claim reproducing Requal's runtime conversion behavior.

## Verification and limits

Nine synthetic SQLite/domain checks verify exact Unicode quotations, inactive-record exclusion, retained authorship, linked coding memos, precise case membership, category provenance, secondary coding, unknown-version quarantine and safe column selection. A separate synthetic database generated from the actual pinned RQDA schema independently verifies the documented SQLite source-slice expression.

Source direction defaults to `auto`. No speaker labels or recording timestamps are inferred. Imported sources remain excluded from AI until consent is reviewed. Unsupported file categories, attributes, point annotations, image/geometry/media selections and ancillary tables are omitted with import notes; keep the original database separately. Full project JSON preserves the migrated records, their provenance and loss notes; the original database remains the authoritative original artifact.
