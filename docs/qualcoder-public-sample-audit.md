# QualCoder public educational project import audit

The browser importer was exercised with an actual public QualCoder SQLite project from [Library Carpentry's QualCoder lesson](https://github.com/LibraryCarpentry/lc-qualitative-qualcoder/tree/6036b0d5f6568cd9f0c259e01318a88e854d0054), rather than a reconstructed test database. The audited asset is `episodes/data/mannheimer_refi_qda_project_recoded.qda/data.qda` at that pinned commit.

The asset is 1,945,600 bytes. SHA-256: `da006dfc3aeb82ae2ba9c37ac947f4446810ef44bd4f7a11a9206f179f1fc0ac`.

The Carpentries license covers instructional material under CC BY 4.0 and code under MIT. The lesson separately identifies the original research dataset at [QDR DOI 10.5064/F6GWMU4O](https://doi.org/10.5064/F6GWMU4O) and its QDR Standard Access agreement. The teaching repository's license does not establish a blanket license for redistributing underlying research data. This audit used only the public GitHub educational copy; no QDR account, gated download or agreement was used. The full dataset and generated project exports remain in disposable audit scratch storage and are not bundled with this app. This report publishes provenance and aggregate verification results only.

## Actual browser and SQL comparison

A disposable local account imported the actual native SQLite file through the app's File input and confirmed the preview as a separate project. SQL records were compared with the resulting project and the real downloaded Complete JSON and REFI-QDA QDPX files.

| Evidence | Result |
| --- | --- |
| Sources | 30, exact source text retained |
| Codes / categories | 230 / 55, definitions and hierarchy retained |
| Text coding applications | 753, all stored quotations, bounds and historical coders match SQL |
| Source text | 1,127,104 Unicode codepoints, including 92 non-ASCII characters and no non-BMP characters |
| Standard REFI-QDA text coding elements | 753; native JSON sidecar also retains all 753 |
| Original document paths | 30 retained; no binary media attached or timing inferred |
| Analysis interface | Workbench, hierarchy treemap and multi-source coding portrait opened successfully |
| Browser page errors | 0 |

The sample contains no cases, attributes, journals, annotations, image coding, audio/video coding, supplied timestamps, stored queries or graph records. Its descriptions/memos are empty. Those paths are not hands-on validated by this sample. A successful text project import is not a native QualCoder export, desktop runtime round trip or full feature parity claim.

## Official CSV examples

The official [QualCoder Examples directory](https://github.com/ccbogel/QualCoder/tree/b95e021c93eb29a646ee7a8de196c281b7890ddf/Examples) contains CSV and source fixtures, but no native project at the audited commit.

| File | Encoding / rows | Explicit case mapping | SHA-256 |
| --- | --- | --- | --- |
| `cases123.csv` | UTF-8, no BOM, LF; 3 rows | Name: `case`; attributes: `Age`, `gender`, `interest` | `347fb35129cf6b666ffd461155f27652127d4c3b016e531a9d562286b7dc2ad7` |
| `survey456.csv` | UTF-8, no BOM, CRLF; 3 rows | Name: `Case`; attributes: `Age`, `Gender`, `Interest`, `freetext` | `38c61e500982bf4cae773fe1421613ff96b19ed560c4e3f3e817dff9a56dd02f` |

Neither file supplies a source link or memo column. Numeric Age requires an explicit numeric definition; the survey's missing Age remains null. Case-table import retains freetext as an attribute. It does not automatically create or code a transcript. The existing importer initially required the exact `name` header; explicit field mapping is necessary for these authentic examples.

## Bounded importer corrections and minimized regression

The synthetic regression covers zero-valued native category/parent IDs, project descriptions, native numeric/character attribute types, missing and invalid numeric values, whole-source membership, passage-specific retrieval and passage revision behavior. Original records remain available for review, and historical authorship does not grant app permissions.

QualCoder's [case display](https://github.com/ccbogel/QualCoder/blob/b95e021c93eb29a646ee7a8de196c281b7890ddf/src/qualcoder/cases.py#L1111) uses Python source slices; [whole-file case assignment](https://github.com/ccbogel/QualCoder/blob/b95e021c93eb29a646ee7a8de196c281b7890ddf/src/qualcoder/case_file_manager.py#L208) uses Python `len`. However, [manual passage marking](https://github.com/ccbogel/QualCoder/blob/b95e021c93eb29a646ee7a8de196c281b7890ddf/src/qualcoder/case_file_manager.py#L532) saves Qt selection positions without a stored quote. Qt UTF-16 positions and Python Unicode codepoints differ for non-BMP characters. Partial case links on those sources therefore remain inert with explicit loss notes; they are never guessed or broadened into whole-source membership. BMP partial links preserve their exact boundaries.

Image/audio/video selections remain original records with an honest loss note until original media are attached and geometry or recording provenance is reviewed. No audio intervals are inferred from text offsets or original document paths.

Actual browser import with explicit mapping passed for both official CSV files: six cases, one missing numeric Age, three freetext attributes, exact byte provenance, no inferred transcripts or coding, and complete JSON preservation.
