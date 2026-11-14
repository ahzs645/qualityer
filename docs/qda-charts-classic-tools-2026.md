# Charts and visual tools in established QDA (CAQDAS) packages

Sources are vendor help pages read in November 2026: MAXQDA 24, NVivo 14/15, the ATLAS.ti Windows manual and the Dedoose Learning Center. Older sources are flagged where used. Anything I could not find documented is left out or marked "not documented".

**Unit:** seg = coded segments, references or excerpts; doc = documents or participants, each counted once; words = words or characters coded.

**Small-n fit** (4–30 participants): **Good** = shows presence, sequence or text. **Caution** = fine if set to count participants rather than segments. **Poor** = implies prevalence or volume, or relies on large-n statistics.

## MAXQDA (MAXQDA 24 help)

| Visual | Question | Encoding | Interaction | Unit | Small-n | Doc |
|---|---|---|---|---|---|---|
| Code Matrix Browser | Which codes appear in which cases? | Codes as rows; documents, groups, sets or speakers as columns. Toggle between squares/circles (7 size steps), numbers, heatmap and % | Hover shows count plus the cell summary. Double-click lists segments. Opens a Quote Matrix. Column sort by similarity | seg; "count hits per document only once" or Binarize gives doc | **Good** (binarized) | https://www.maxqda.com/help/visual-tools/code-matrix-browser-visualizing-codes-per-document |
| Code Relations Browser | Which codes co-occur? | Code × code grid as symbols, values or heatmap; row/column sums | Double-click lists segments | Overlap; within *n* paragraphs; or same document (doc) | **Caution** (use same-document mode) | https://www.maxqda.com/help/visual-tools/code-relations-browser-visualizing-overlapping-codes |
| Code Map / Document Map | Which codes, or which cases, are similar? | 2D MDS; colour = average-linkage cluster; size = frequency; optional weighted lines | Save clusters as variables or sets | seg or presence | **Poor** (the manual warns 2D distorts distances) | https://www.maxqda.com/help/visual-tools/code-map-position-codes-according-to-similarity |
| Document Comparison Chart | How does code order differ across interviews? | One row per document; columns are paragraphs or 100 equal slices ("Standardize Document Length"); cells split by code colour | Double-click jumps to the text | position | **Good** | https://www.maxqda.com/help/visual-tools/document-comparison-chart-a-visual-comparison-of-coded-text |
| Document Portrait | What is one interview made of? | 30×40 tile mosaic sized by segment length; order by sequence or colour, or stacked like a bar chart | Click a tile to jump to the text | words | **Caution** | https://www.maxqda.com/help/visual-tools/document-portrait-visualizing-a-document |
| Codeline | Where in an interview do codes occur? | x = paragraph or time; y = codes | Double-click jumps to the text; fit to width | position | **Good** | https://www.maxqda.com/help/visual-tools/codeline-the-sequential-visualization-of-a-document |
| Profile Comparison Chart | How do up to 15 cases compare across codes and variables? | Parallel coordinates; groups can show sum, mean, median, n docs or % docs | Colour lines by a variable | seg / % doc | **Caution** | https://www.maxqda.com/help/visual-tools/profile-comparison-chart-compare-code-frequencies-and-variable-values |
| Code Trends | How does a code change across ordered documents? | Line chart | Click a point to list its segments | seg or coverage % | **Caution** | https://www.maxqda.com/help/visual-tools/code-trends |
| Code Cloud / Word Cloud | Which codes or words dominate? | Font size = frequency | Click a word to list its hits | seg / words | **Poor** | https://www.maxqda.com/help/visual-tools/code-cloud |
| Crosstab | How do codes spread across variable-defined groups? | Table; "Highlight highest values" shades by row, column or all cells | Double-click lists segments | seg or doc; **column % of number of documents** | **Good** | https://www.maxqda.com/help/mixed-methods/crosstab |
| Segment Matrix | What did each group say? | Segment text in a codes × groups grid; headers show n docs and n segments | Edit comments and weights | text | **Good** | https://www.maxqda.com/help/mixed-methods/segment-matrix |
| Summary Grid / Summary Table | Framework matrix | Documents × codes, with written summaries in cells | Right-click shows the source segments | summaries | **Good** | https://www.maxqda.com/help/summarizing/summary-tables |
| Code Patterns (formerly Code Configurations) | Which code combinations co-occur? | Table of combinations with % ; bar or pie chart | Double-click lists segments | seg or doc | **Good** (doc) | https://www.maxqda.com/help/analyze-coded-segments/code-patterns |
| Typology Table, subcode charts, Stats cluster analysis | Group means and %; subcode distribution; statistical types | Tables, bars/pies, box plots | Activate the matching documents | doc / seg | **Poor** at n=4 | https://www.maxqda.com/help/mixed-methods/typology-table |
| MAXMaps model templates | Diagrams generated from the data | Two-Cases model (shared vs unique codes); Code Distribution model (code in the centre, documents around it, line width in 3 levels relative to mean and SD); co-occurrence model and others | Linked to the data | seg | **Good** (Two-Cases) | https://www.maxqda.com/help/maxmaps/model-templates-in-maxmaps |
| Interactive Word Tree (MAXDictio) | Which phrases surround a word? | Keyword-in-context tree | Alt-click to re-root | words | **Good** | https://www.maxqda.com/help/maxdictio/word-tree |

## NVivo (14/15 help)

| Visual | Question | Encoding | Interaction | Unit | Small-n | Doc |
|---|---|---|---|---|---|---|
| Hierarchy chart (treemap / sunburst) | Which codebook branches carry the most coding? | "Size By" coding references or items coded; "Color By" a second metric | Tooltip shows direct vs aggregated values | seg or doc | **Caution** (parents include their children) | https://help-nv.qsrinternational.com/14/win/Content/vizualizations/hierarchy-charts.htm |
| Matrix coding query | Cases × codes intersections | Grid with cell shading; cell content can switch between references, files and words | Double-click opens the content; transpose, filter, sort; Chart tab | seg, doc or words | **Good** (doc) | https://help-nv.qsrinternational.com/14/win/Content/queries/matrix-coding-query.htm |
| Crosstab query | Codes × cases or attributes | Cases coded, coding references, or **Coding Presence (Yes/No)**; count, row % or column %; heat map. NVivo 15 adds statistics, a **PCA biplot** and box plots | Double-click shows the content | seg, doc or presence | **Good** (presence); PCA **Poor** | https://help-nv.qsrinternational.com/15/win/Content/queries/crosstab-query.htm |
| Framework matrix | Case × theme summaries | Summaries in cells, can be auto-filled with coded text | Summaries persist after the matrix is deleted | text | **Good** | https://help-nv.qsrinternational.com/14/win/Content/notes/framework-matrices.htm |
| Charts wizard | Coding for a file or code, or by attribute | Bar/column (stacked, 100% stacked, grouped), pie, bubble, heat map, radar | Summary tab; drill-down not documented | seg, % coverage | **Caution** | https://help-nv.qsrinternational.com/15/win/Content/vizualizations/charts.htm |
| Cluster analysis | Which files or codes are similar? | Dendrogram or 2D/3D map; Jaccard, Pearson or Sørensen; complete linkage | Summary tab of similarity indices | coding pattern | **Poor** (the manual calls it "exploratory") | https://help-nv.qsrinternational.com/14/win/Content/vizualizations/cluster-analysis.htm |
| Comparison diagram | What do two items share, and what is unique to each? | Two hubs, with shared items between them | Toggle child codes | presence | **Good** | https://help-nv.qsrinternational.com/15/win/Content/vizualizations/comparison-diagrams.htm |
| Explore diagram, sociogram, mind/concept/project maps | Item neighbourhoods, relations, free drawing | Node-link diagrams; sociogram adds centrality measures | Explore diagram re-centres on click, with back/forward history | presence | **Good** | https://help-nv.qsrinternational.com/15/win/Content/vizualizations/visualizations.htm |
| Word tree; word cloud | Words in context; frequent words | Tree with font size by frequency; cloud or treemap | Change the root term; branch order | words | Tree **Good**; cloud **Poor** | https://help-nv.qsrinternational.com/14/win/Content/queries/text-search-query.htm |

## ATLAS.ti (current Windows manual)

| Visual | Question | Encoding | Interaction | Unit | Small-n | Doc |
|---|---|---|---|---|---|---|
| Code-Document Table | Codes × documents | Row, column or total relative frequencies; **Normalization** scales to the largest document; **Binarize** shows a dot for presence | Click a cell to see its quotations | seg / presence | **Good** (binarized) | https://manuals.atlasti.com/Win/en/manual/CodeDocumentTable/CodeDocumentTableBinarize.html |
| Code-Document Sankey and bar chart | Visual form of the table | Edge width ∝ cell value; zero cells hidden | **Click an edge to see its quotations** | seg | **Caution** | https://manuals.atlasti.com/Win/en/manual/CodeDocumentTable/CodeDocumentTableVisualization.html |
| Code Co-occurrence Table, with Sankey, bar and force-graph views | Which codes overlap? | Count and/or **c-coefficient** n12/(n1+n2−n12); a red dot flags distorted values; "Compress" drops empty rows and columns | Click a cell to see its quotations | seg | **Caution** | https://manuals.atlasti.com/Win/en/manual/CodeCooccurrence/CodeCoOccurrenceTable.html |
| Networks | Theory and relation diagrams | Nodes show groundedness (quotations) and density (links) | "Add Co-occurring Codes", "Add Neighbors" | seg | **Good** | https://manuals.atlasti.com/Win/en/manual/Networks/NetworksAnalyticFunctions.html |
| Opinion mining; Find Concepts; code and word clouds | Sentiment aspects; noun phrases; frequency | Positive and negative ranked columns; cloud or list | Select an item to see its text | hits / words | **Caution / Poor** | https://manuals.atlasti.com/Win/en/manual/SearchAndCode/SearchAndCodeOpinionMining.html |

## Dedoose (Learning Center)

Every chart is "live": clicking any number, bar or bubble opens the excerpts behind it, and those excerpts can become an active data set.

| Visual | Question | Encoding | Interaction | Unit | Small-n | Doc |
|---|---|---|---|---|---|---|
| Code Application | How often was each code used per media file? | Media × codes grid with numbers | Sort | seg | **Caution** | https://helpdesk.dedoose.com/hc/en-us/articles/20904155917197-Code-Application |
| Code Presence | Was each code used, per document? | Same grid showing "1" or blank | Click | doc | **Good** | https://helpdesk.dedoose.com/hc/en-us/articles/22435904426893-Code-Presence |
| Code Co-Occurrence | Which codes share excerpts? | Heatmap, warm to cool | "Include Overlapping Excerpts" toggle | seg | **Caution** | https://helpdesk.dedoose.com/hc/en-us/articles/22435683727629-Code-Co-Occurrence |
| Code by Descriptor | How does a code vary by participant group? | Bars; **Normalize** (as if groups were equal size), **%**, **Sub-code Count**, **Descriptor Count** (media instead of excerpts) | Click | seg or doc | **Good** (Descriptor Count) | https://helpdesk.dedoose.com/hc/en-us/articles/22436643224461-Code-by-Descriptor-Chart |
| Descriptor × Code, Descriptor × Descriptor × Code, Field × Code Grid | Codes across one or two descriptors (intersectional) | Bars, grid, or frequency/**weight** bubbles | Click | seg / mean weight | **Caution** | https://helpdesk.dedoose.com/hc/en-us/articles/22438322518413-Descriptor-Field-x-Code-Grid-Chart |
| Bubble plot; Packed Code Cloud | Three codes per group; prominent codes | x, y and size each show a code; cloud with Fast/Best layout | Click | seg | **Poor** | https://helpdesk.dedoose.com/hc/en-us/articles/20904041755021-Code-Cloud |
| Descriptor Ratios and other descriptor charts | Sample make-up | Pie/bar, histogram, scatter with r | Click or drag to select participants | doc | **Good** (sample description) | https://helpdesk.dedoose.com/hc/en-us/articles/22461550345741-Descriptor-Ratios-Chart |
| Testing Center | Inter-rater agreement | Cohen's kappa per code; Pearson r for weights | Excerpt-by-excerpt review | seg | **Good** | https://helpdesk.dedoose.com/hc/en-us/articles/12905437600269-Testing-Center-IRR-using-Cohen-s-Kappa |

## QDA Miner (Provalis; User Guide 6.0, the 2024 release was not checked)

All rows cite https://provalisresearch.com/Download/QDAMiner6.pdf

| Visual | Question | Encoding | Interaction | Unit | Small-n |
|---|---|---|---|---|---|
| Coding by Variables crosstab (p. 262ff) | Codes × variable values | **Count**: occurrence (cases), frequency, words or % words. **Display**: count, row %, column % or total %. Bar, line or bubble charts | Right-click a cell to retrieve its segments | choosable | **Good** (occurrence) |
| Heatmap with clustering (p. 268ff) | Which codes pattern with which groups? | Colour shows %; optional row and column dendrograms; a chosen number of clusters with red divider lines; sort when not clustering; **min/max contrast sliders**; column clustering can be switched off to keep ordinal order | not documented | any count | **Caution** (reordering is good) |
| Co-occurrence dendrogram, 2D/3D MDS, link analysis (p. 237ff) | Clusters of codes or cases | Co-occurrence within a case, a window of *n* paragraphs, overlap, or same segment; Jaccard, Sørensen, Ochiai or cosine | A dendrogram cluster feeds the network view | doc or seg | **Caution** |
| Proximity plot (p. 251f) | How close is every code to a target? | Single-axis bars; mirrored bars for two targets | Double-click a bar to make it the target | as above | **Good** |
| Coding Sequences (p. 256ff) | Does code B follow code A? | A × B matrix of z-values in green/red (above or below expected) | Set distance in words, paragraphs or codes | seg | **Caution** |
| Document Overview (p. 296); correspondence analysis | Code positions in one document; biplot | Coloured bars, "Stacked" for volume; CA map | Click a bar to highlight the text | position | Overview **Good**; CA **Poor** |

## Quirkos (2.4 guide, 2020) and Leximancer (User Guide 5.0, 2021)

| Tool / visual | Question | Encoding | Interaction | Unit | Small-n | Doc |
|---|---|---|---|---|---|---|
| Quirkos canvas | Live code frame | Bubbles; Wikipedia says size = amount coded, the manual does not say | Double-click shows quotes | seg | **Caution** | https://www.quirkos.com/learn-qualitative/features.html |
| Quirkos overlap view | What co-occurs with this code? | "A sort of Venn diagram": distance = less overlap | Click to see the shared quotes | seg | **Caution** | https://www.quirkos.com/Quirkos-2.4-the-guide.pdf |
| Quirkos query / compare view | Subgroup A vs subgroup B | Side-by-side quotes | Filter by properties | text | **Good** | same guide |
| Leximancer concept map | Unsupervised themes | Concepts placed by co-occurrence; theme circles with a size slider; heat colour = importance; optional spanning tree | Click a theme to see its excerpts | text blocks | **Caution** | https://www.leximancer.com/s/Leximancer-User-Guide-5.pdf |
| Leximancer Insight Dashboard | What characterises each group? | Quadrant: Strength P(group given concept) × Frequency P(concept given group) on a log scale; "Prominence" score | Standalone PDF/HTML report | text blocks | **Caution** (useful idea) | same guide, pp. 108–112 |

(A Quirkos "cluster view" appears only as a marketing caption and is not documented.)

## Open-source and other tools

| Tool | Visuals found | Doc |
|---|---|---|
| QualCoder | Pie, bar, sunburst and treemap of codes; **heatmap** and stacked bar of files or cases × codes (plotly, max 40×40, unit only called "code frequency"); co-occurrence table with clickable cells; code relations with distances and box plots; 0/1 segment × code grid; kappa coder comparison; hand-built **Graph** of codes, memos and segments | https://github.com/ccbogel/QualCoder/wiki/5.3.-Reports |
| Transana | Keyword Map (codes on a timeline); **Series Keyword Sequence Map** (one row per episode, clickable); Keyword Bar Graph (time per keyword); **Keyword Percentage Graph** (% of episode, comparable across lengths) | https://www.transana.com/tutorial/?p=5607 |
| webQDA | Matrices, code tree and word cloud (seen only in a 2018 review) | https://www.surrey.ac.uk/sites/default/files/2018-09/webqda-review-august-2018.pdf |
| Taguette | No charts; tag counts and export only | https://taguette.org/getting-started.html |
| f4analyse (now "f4") | No chart documentation found | — |

## Most interesting ideas for a small-n framework study (ranked)

1. **A unit toggle on every matrix, defaulting to participants.** Precedents: MAXQDA "count once per document" and Binarize, NVivo Coding Presence, ATLAS.ti Binarize, Dedoose Code Presence and Descriptor Count. Name the unit in the legend.
2. **A framework matrix with tinted cells.** Show the summary text in each cell (NVivo framework matrices, MAXQDA Summary Grid), with presence or intensity as background shading. A click opens the source segments.
3. **Every mark opens its quotes.** All the major tools do this; Dedoose also turns the selection into a filter.
4. **Explicit normalisation:** by row, column or total (MAXQDA, ATLAS.ti, QDA Miner), plus "% of N participants" (MAXQDA Crosstab).
5. **Seriation without heavy statistics.** Reorder rows and columns by similarity (QDA Miner heatmap dendrograms with dividers; MAXQDA "sort by similarity"), with an option to keep a fixed order.
6. **Encoding toggle:** symbol size vs heat colour vs numbers (MAXQDA Code Matrix Browser, 7 size steps).
7. **Interview-sequence strips** (Codeline, Document Comparison Chart with length standardisation, Transana Series Keyword Sequence Map). How much someone talks does not distort these.
8. **Shared vs unique comparison** of two participants or groups (NVivo comparison diagram, MAXQDA Two-Cases model).
9. **Code combinations by participant** ("A+B in 3 of 4"; MAXQDA Code Patterns) instead of pairwise co-occurrence counts.
10. **Proximity plot** (QDA Miner) instead of MDS maps, which MAXQDA and NVivo themselves call distorting or exploratory.
11. **A group-difference quadrant**: frequency vs distinctiveness (Leximancer Insight Dashboard), computed on presence counts.
12. **Demote** clouds, packed bubbles, bubble plots, PCA and CA biplots, and area mosaics compared across cases. All of them suggest prevalence.
