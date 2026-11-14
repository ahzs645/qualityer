# Charts for interview-based qualitative evidence: a survey for Explore

Scope: what published qualitative and mixed-methods work, QDA tools and visualisation practice use to graph coded interviews. Each entry is checked against `web/` (Explore, Guide, Framework, Review, Assist, Ask, Overview). Written 2026-11-14.

The main warning from the methods literature: counts of coded passages measure how much someone talked, how the guide was built and how finely a coder split text. They do not measure prevalence. Maxwell calls simple counts "quasi-statistics". They can make "some", "most" and "usually" more precise, but they risk overgeneralisation and "variance thinking" ([Maxwell 2010](https://studysites.uk.sagepub.com/braunandclarke/study/SAGE%20Journal%20Articles/Ch%2010.%20Maxwell.pdf); [Sandelowski, Voils & Knafl 2009](https://pmc.ncbi.nlm.nih.gov/articles/PMC2784172)). In every chart below, the safe unit is **participants**: a person either raised something or did not. Passage counts come second.

## 1. Catalogue

| Chart | Question it answers | Source | We have it? | Caution |
|---|---|---|---|---|
| Framework matrix (case × theme summaries) | What did each person say about each theme? | [Gale et al. 2013](https://bmcmedresmethodol.biomedcentral.com/track/pdf/10.1186/1471-2288-13-117) | **Yes**: Framework route (text cells, pinned quotes) | Summaries are the analyst's reading. Empty cells can mean "not asked" or "not coded" |
| Case-ordered descriptive meta-matrix | Do cases sorted on one outcome differ systematically on others? | [Miles, Huberman & Saldaña 2014](https://books.google.co.id/books?id=fjh2DwAAQBAJ); [Averill 2002](https://synapsesocial.com/papers/W2170754611) | **No**: framework rows are in source order and cannot be sorted by stance or attribute | The ordering variable is itself a judgement. Say who set it |
| Conceptually clustered / variable-by-variable matrix | Which themes travel together across cases? | Miles, Huberman & Saldaña (above) | **Partly**: co-occurrence heatmap (`explore.tsx` `Heatmap`) | Co-occurrence on one passage is not a relationship in the participant's mind |
| Code × attribute crosstab | Do managers raise themes that front-line staff do not? | [NVivo crosstab](https://mdlutoronto.github.io/nvivo-14-15-windows-intro/part_2_queries/matrix-coding-and-crosstab-queries/); [MAXQDA Code Matrix Browser](https://www.maxqda.com/products/maxqda/visualtools) | **No** (already ranked #1 in `feature-gaps-2026-qda-survey.md`) | With 4–30 people, a cell of 1 vs 2 is not a group difference |
| Qualitative heat table | Which themes came up for whom, at a glance? | [Evergreen & Lyons, Qualitative Chart Chooser](https://stephanieevergreen.com/wp-content/uploads/2021/07/Qualitative-Chooser.pdf); [Khulisa on heat tables](https://khulisa.com/?p=8865); [UserTesting](https://usertesting.com/blog/qualitative-heatmaps) | **Partly**: Profile (cases by domain) shows claim counts with bars; guide coverage matrix | Colour intensity from passage counts reads as "importance" |
| Convergence-coding matrix (agreement / partial / silence / dissonance) | Where do participants or groups agree, partly agree, stay silent or contradict each other? | [Farmer et al. 2006, triangulation protocol](https://globalhealthsocialscience.tghn.org/articles/developing-and-implementing-triangulation-protocol-qualitative-health-research) | **No** | "Silence" is not disagreement. Check guide coverage before calling it |
| Diverging stacked bar (ordinal stance) | How is stance on a theme split, with a neutral centre? | [Heiberger & Robbins 2014](https://www.jstatsoft.org/article/view/v057i05); counter-view in [Datawrapper](https://blog.datawrapper.de/divergingbars) | **Partly**: Profile shows 100% stance bars per cell, not diverging | Percentages of 4 people read as a poll. Show dots per person instead |
| Allies/opponents (stance × influence) map | Who is for or against, and how much do they matter to adoption? | [Umbrex power–interest](https://umbrex.com/?p=241376); [USAID IPC Tech Note 2](https://webarchive.library.unt.edu/eot2008/20080918010022/http:/www.usaid.gov/our_work/democracy_and_governance/publications/ipc/tn-2.pdf) | **No** | Influence is not in our data, so it would be invented. Use role level only if it is defined as such |
| Joint display (statistics-by-theme, side-by-side) | How do the qualitative findings line up with numbers or labels? | [Guetterman, Fetters & Creswell 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4639381) | **Partly**: Ask answers side by side; report "Participant perspectives" | Putting text next to numbers implies they measure the same thing |
| Summary of findings with confidence | How much should we trust each finding? | [GRADE-CERQual, Lewin et al. 2018](https://eprints.whiterose.ac.uk/127045) | **No**: E1–E4 grades exist per claim, but there is no per-theme evidence profile | Evidence grade is the type of support a speaker offered, not the confidence in our finding |
| Document portrait / codeline / comparison chart | Where in an interview does each code fall? | [MAXQDA visual tools](https://www.maxqda.com/products/maxqda/visualtools); [Document Comparison Chart](https://www.maxqda.com/help/visual-tools/document-comparison-chart-a-visual-comparison-of-coded-text) | **Yes**: Interview map (`InterviewMap.tsx`), one interview at a time | Position follows the guide order, so it is not a change in a person's view |
| Trajectory / timeline display | Does a person's position shift during the interview? | [Timescapes timelines guide](https://research.leedstrinity.ac.uk/en/publications/capturing-time-in-qualitative-longitudinal-field-enquiry-timeline/) | **Partly**: stance lane per interview, no cross-person comparison | Interviewer prompts drive shifts |
| Sankey (codes → documents/groups) | How do codes flow into documents or themes? | [ATLAS.ti code-document Sankey](https://manuals.atlasti.com/Win/en/manual/CodeDocumentTable/CodeDocumentTableVisualization.html) | **No** | Band width = codings, so it implies volume and flow. Weak for 4–30 cases |
| Code network / cluster view | Which codes connect? | [ATLAS.ti co-occurrence](https://manuals.atlasti.com/Win/en/manual/CodeCooccurrence/CodeCoOccurrenceTableVisualization.html); [Quirkos (G2)](https://www.g2.com/products/quirkos/reviews); [NVivo explore/comparison diagrams](https://help-nv.qsrinternational.com/14/win/Content/vizualizations/comparison-diagrams.htm) | **Yes**: Network | Layout distance carries no meaning |
| Tag-count bar / pie / treemap | Which tags are most used? | [Dovetail charts](https://docs.dovetail.com/help/projects/charts); [Delve](https://delvetool.com/blog/case-study-upenn) | **Partly**: Overview "new codes per interview"; Words | The purest counts ≠ prevalence trap |
| Word cloud / word frequency | Which words recur? | MAXQDA, Quirkos ([mx-vis](https://www.maxqda.com/products/maxqda/visualtools)) | **Partly**: Words (bar list, phrases) | Words without context. Already de-prioritised |
| Dot-per-response quote explorer | What do people say in their own words, and how do the quotes spread across themes? | [Pew "In their own words"](https://www.pewresearch.org/short-reads/2020/12/17/what-biden-and-trump-supporters-tell-us-in-their-own-words-about-americas-political-divisions) | **No** | Pew coded thousands of responses. With 4 people every dot is one person's voice, so name them |
| Beeswarm with hover tooltips | Spread of items on one scale, each item inspectable | [Flourish](https://flourish.studio/blog/what-is-a-beeswarm-plot/); [data.europa.eu guide](https://data.europa.eu/apps/data-visualisation-guide/beeswarm-plots) | **No** | Talkative participants dominate. Offer "one dot per person" |
| Evidence wall / quote wall | Which quotes support or contradict a claim? | [MAXMaps for variance and commonality](https://www.maxqda.com/focus-group-research); [Boardmix on conflicting interview findings](https://boardmix.com/articles/conflicting-user-interview-findings/) | **Partly**: pinned quotes in framework cells; Retrieve | Curated quotes can cherry-pick. Show the counter-quotes too |
| Rater agreement / confusion matrix | Where do the AI and a person disagree? | Dedoose / MAXQDA intercoder (see gaps doc) | **Yes**: Explore → AI and you; Assist calibration | Agreement on easy passages inflates it |
| AI confidence × decision | Is model confidence worth anything? | (internal; decision log) | **Partly**: DecisionLog summary and CSV; no chart | Small n per band |
| Rapid-analysis respondent × domain matrix | Quick summary per person and domain | [Hamilton RQA, via Implementation Science](https://implementationscience.biomedcentral.com/articles/10.1186/s13012-019-0853-y/figures/2) | **Partly** (framework) | — |

Taguette has no built-in charts. Users export and chart elsewhere ([NYU Shanghai guide](https://nyu-shanghai-data-services.github.io/TMA-QDA/modules/setup/Taguette)). Condens has charts, but nothing found documents a tag × participant view ([Condens help](https://condens.io/help/using-/)).

## 2. Ranked shortlist for this study (4 interviews now, 15–30 later)

Shared rules for all six:
- **Unit:** the default unit is the participant (a source, or a case). Passage counts appear only in tooltips.
- **Exclusions:** AI claims marked `pending` are left out. `unchecked` claims are hatched.
- **Click-through:** every mark opens the passages in Retrieve or the framework cell.

### 1. Stance range by theme ("where people stand")

- **Data:** for each Theme (`theme.codeIds`) and each source, the claims from `buildClaims` whose substantive code is in the theme, with each claim's stance code (S1–S5).
- **Encoding:** themes are rows. The x-axis is the ordinal stance scale S1 supportive … S5 opposed, with S3 at the centre. Each participant gets one dot at their median stance, plus a thin line from their least to their most supportive claim. Dots take a categorical colour per participant, with a label at small n. A grey row tail reads "not raised by P3, P4".
- **Interaction:**
  - Click a dot to open that person's claims for the theme in Retrieve (`codes=…&sources=…`).
  - Click the row label to open the framework column.
- **Caveat:** "Each dot is one participant's position as coded from what they said on this theme. It is not a measured attitude, and the spread is not a sample distribution."
- **Basis:** a diverging scale that keeps every person visible ([Heiberger & Robbins](https://www.jstatsoft.org/article/view/v057i05)) instead of percentages.

### 2. Convergence matrix (agreement, partial, silence, dissonance)

- **Data:** themes × participant groups from a source attribute (role level, organisation type, insider status), or × individual participants. The suggested label comes from the stance spread within the cell, plus guide coverage: `no-view` or `not-asked` gives *silence (not asked)* rather than *silence*. The researcher confirms or overrides each label and adds a note.
- **Encoding:** a categorical cell fill with four labelled states plus "not asked" (hatched). Text labels sit in the cells, so colour is not the only cue.
- **Interaction:** click a cell to open a side-by-side quote panel, with the most supportive and most opposed claims next to each other.
- **Caveat:** "Agreement is judged on meaning, not on counts. Silence means the topic did not come up and is not disagreement. Groups of one or two people cannot show a group difference."
- **Basis:** [Farmer et al. 2006](https://globalhealthsocialscience.tghn.org/articles/developing-and-implementing-triangulation-protocol-qualitative-health-research). It also covers the code × attribute crosstab gap without percentages.

### 3. Case-ordered meta-matrix (participants sorted by overall view)

- **Data:**
  - **Rows:** participants, ordered by the Ask overall label (the label parsed in `lib/report.ts`, enthusiastic → opposed). Unlabelled participants come last.
  - **Columns:** themes.
  - **Cells:** the framework summary's first sentence, a stance glyph (median S) and an evidence-grade glyph (best E).
  - **Side columns:** source attributes.
- **Encoding:** a table with small inline glyphs, not a heatmap. The sort can be switched to any attribute.
- **Interaction:** click a cell to open the framework cell with its pinned quotes. Click the row label to open the Ask answer card.
- **Caveat:** "Rows are ordered by an AI-drafted overall label that a person reviewed. Check that the order holds before reading patterns down the columns."
- **Basis:** [Miles, Huberman & Saldaña](https://books.google.co.id/books?id=fjh2DwAAQBAJ); [Averill 2002](https://synapsesocial.com/papers/W2170754611).

### 4. Evidence profile per theme (CERQual-style)

- **Data:** for each theme, the claims grouped by participant, coloured by evidence grade E1–E4. Counts are kept of participants contributing, of participants with any E1/E2 claim, and of claims still `unchecked`.
- **Encoding:** a unit chart, one small square per claim, stacked in a column per participant and ordered E1 → E4. The sequential colour runs dark (documented) to light (opinion). A text column on the right reads, for example, "3 of 4 people; 2 with firsthand or documented support".
- **Interaction:** click a square to open the passage. Hover shows the quote and timestamp.
- **Caveat:** "Grade describes the kind of support the speaker gave (a document, firsthand experience, hearsay, opinion), not whether it is true. More squares means more passages, not more people."
- **Basis:** [GRADE-CERQual](https://eprints.whiterose.ac.uk/127045) (adequacy of data per finding).

### 5. Quote swarm for one theme

- **Data:** for one chosen theme, every claim. The x-axis is stance S1–S5. Lanes on y are evidence grades. Colour is the participant. Pinned framework quotes get an outline.
- **Encoding:** a beeswarm of dots, with a toggle to show one dot per person (their median). A strip below lists the three outlined quotes in full.
- **Interaction:** hover shows the quote text and the speaker ID. Click opens the transcript at that timestamp.
- **Caveat:** "Each dot is one passage. Someone who spoke longer has more dots. Switch to 'one per person' to compare people."
- **Basis:** Pew's [dot-per-response explorer](https://www.pewresearch.org/short-reads/2020/12/17/what-biden-and-trump-supporters-tell-us-in-their-own-words-about-americas-political-divisions); [beeswarm practice](https://flourish.studio/blog/what-is-a-beeswarm-plot/).

### 6. Stance across the guide (small multiples)

- **Data:** one small panel per participant. The x-axis is guide-question order (coverage marks map claims to questions, with the timestamp as a fallback). The y-axis is stance S1–S5 for each claim. A shaded band marks a question that was `not-asked`.
- **Encoding:** points with a light step line, on a shared scale across panels, so that 15–30 panels can be compared.
- **Interaction:** click a point to open the passage. Click a panel title to open that participant's Interview map.
- **Caveat:** "The order follows the interview guide. A shift may reflect the topic being asked about, not a change of mind."
- **Basis:** [MAXQDA Document Comparison Chart](https://www.maxqda.com/help/visual-tools/document-comparison-chart-a-visual-comparison-of-coded-text); [Timescapes timelines](https://research.leedstrinity.ac.uk/en/publications/capturing-time-in-qualitative-longitudinal-field-enquiry-timeline/).

### Runner-up and charts to avoid

- **Runner-up:** an AI-confidence × decision chart from the decision log (kept / changed / rejected per confidence band). It is useful for the audit trail, but it says nothing about participants.
- **Avoid for now:** Sankey or alluvial charts, word clouds, pie or treemap tag counts, and percentage-based diverging bars at this n. Each one implies volume or prevalence that interview data cannot support.
