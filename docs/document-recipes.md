# Word and PDF reports with document-kit

The Report screen builds Word files and PDFs with [document-kit](https://github.com/ahzs645/document-kit). The kit is
included as a git submodule at `vendor/document-kit`.

A report is a **recipe**: JSON that lists the parts of a document in order. Each part uses a **component**, which is
JSON in the kit's block model with `{{ tags }}` where the study's values go. The app works out every value
(`web/src/lib/kit/data.ts`). The recipe only says where each value goes and how it looks.

- **Rendering:** the recipe is rendered into a Word file, and the kit lays that file out as a PDF or as page pictures.
- **No network:** all of this runs in the browser. Fonts are the kit's open stand-ins (Carlito for Calibri, Arimo for
  Arial and others), served by the app itself.

## Getting the code

```sh
git clone --recurse-submodules https://github.com/ahzs645/qualityer
# or, in an existing clone
git submodule update --init vendor/document-kit
```

`web/scripts/ensure-kit.mjs` installs and builds the kit when needed. It runs before `npm run dev`, `build`,
`typecheck` and `test` in `web/`, so nothing else is needed. CI checks out the submodule (`submodules: true`).

To move to a newer kit:

```sh
cd vendor/document-kit && git pull origin main && cd ../.. && git add vendor/document-kit
```

## What ships

| Recipe | What it is |
|---|---|
| `rw-visual` | **Visual brief.** Charts first, on landscape pages. |
| `rw-summary` | **Summary.** Extends Standard: brief perspectives, findings by theme with one quote, and open items. |
| `rw-standard` | **Standard report.** Sources, coverage, perspectives, asides, the framework with pinned quotes, cases by domain, figures and open items. |
| `rw-full` | **Full audit.** Extends Standard: every section, every quote, the AI audit, memos, the codebook, and a "left to complete" list. |
| `rw-casebook` | **Participant casebook.** Extends the visual brief, in portrait: everyone together first, then each participant on pages of their own. |

The recipes are in `web/src/lib/kit/recipes.json`. The components are in `web/src/lib/kit/components.json`:
`rw-title`, `rw-tiles`, `rw-bullets`, `rw-table`, `rw-chart`, `rw-chart-grid`, `rw-cards`, `rw-perspectives`,
`rw-asides`, `rw-framework`, `rw-quotes`, `rw-ai`, `rw-memos`, `rw-codebook` and `rw-person`. Recipes also use the
kit's shared components: `data-table`, `figure`, `notice`, `running-header`, `page-footer` and `to-complete`.

Charts are the visual brief's SVG charts (`web/src/lib/visual-report.ts`). They are drawn to PNG on a canvas,
because Word files do not take SVG. When no canvas is available, as in the tests, the charts are left out.

## On the Report screen

- **Who it covers:** all interviews together, or one participant. For one participant, the recipe is rendered
  against that participant's data. The casebook repeats `rw-person` once per participant.
- **Format** picks the recipe that matches it. The section checkboxes are laid over that recipe's `options.show`.
  Other recipes, including your own, keep their own settings.
- **Word and PDF:**
  - **Word** and **PDF** download the document.
  - **Everyone + each (.zip)** makes one folder for everyone together, then one per participant. Each folder has a
    `.docx` and a `.pdf`.
- **Preview → Word and PDF pages** shows the same layout the PDF gets.
- **Left to complete:** after each build, the screen lists what the document left blank. For example, a framework
  cell with no summary prints `[summary]` and is listed.

## Your own recipes

**Make my own** copies the chosen recipe as an *extension*. The copy names the recipe it was based on, so later fixes
to that recipe still reach it. You can change its name, the label it prints, the number of quotes per framework cell,
and which sections it shows.

Your own recipes are saved with the study (`project.reportRecipes`, which is the kit's library overrides). They travel
in every study export.

- **Share recipe** saves the recipe as a `.recipe.json` file.
- **Import recipe** adds one from a file. An imported recipe gets a fresh id and name if its own are already in use,
  and it is compiled before it is kept.

A recipe file can do more than the screen offers. It can `extends` another recipe and apply `changes`: `add`,
`remove`, `move` or `set` a part, or `setSection` to change paper or orientation. See the kit's `docs/recipe.md`.
For example, this recipe adds a notice after the title of the Summary:

```json
{
  "kind": "document-kit-recipe",
  "version": 1,
  "recipe": {
    "kind": "recipe",
    "id": "own-board-summary",
    "name": "Board summary",
    "extends": "rw-summary",
    "changes": [
      { "add": { "use": "notice", "id": "board-note", "with": { "text": "Prepared for the board meeting." } }, "after": "title" }
    ]
  }
}
```

## The data a recipe reads

`recipeData(project, scope)` gives these values:

| Name | Holds |
|---|---|
| `study` | `title`, `question`, `method`, `reviewer`, `generated`, `status`, `final`, `signoffNote`, `anonNote`, `scope`, `person`, `personNote` |
| `glance` | `tiles` (`value`, `label`) and `line` |
| `headlines`, `limitations` | Lists of sentences |
| `sources`, `coverage`, `profile`, `codeCounts`, `figures` | Tables as `{ columns, rows }` |
| `perspectives` | `title`, `question`, `note`, and `people`: `name`, `tag`, `lead`, `leadShort`, `full` and `brief` (lists of `heading` and `items`) |
| `asides` | One entry per question: `title`, `sensitive`, `counts`, and `people` (`name`, and `items` of `note`, `quote`, `time`) |
| `framework` | One entry per theme: `title`, `interpretation`, and `cells` (`name`, `summary`, `short`, `mix`, `quotes`) |
| `ai`, `open`, `memos`, `codebook` | The audit trail, open items, memos and codebook |
| `charts` | `stance`, `mix`, `evidence`, `raised`, `coverage`, `pairs` and `asides` as pictures; `through` and `themes` as lists of `{ image, label }` |
| `notes` | How to read each chart |
| `cards`, `quotes` | Hopes, worries and conditions; one quote per theme |
| `casebook` | One entry per participant: `name`, `attributes`, `tiles`, `headlines`, `charts`, `card`, `quotes` |

When the study is anonymised, masked names are replaced in every string, including the charts. Off-the-record wording
is withheld.
