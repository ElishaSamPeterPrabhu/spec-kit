---
description: Scan project for Material UI (MUI) usage and generate a migration plan to Modus Web Components.
handoffs:
  - label: Implement Migration
    agent: speckit.implement
    prompt: Start implementing the migration tasks
    send: true
tools:
  - 'modus-docs/get_modus_component_data'
  - 'modus-docs/get_modus_implementation_data'
scripts:
  sh: scripts/bash/create-new-feature.sh --json "{ARGS}"
  ps: scripts/powershell/create-new-feature.ps1 -Json "{ARGS}"
agent_scripts:
  sh: scripts/bash/update-agent-context.sh __AGENT__
  ps: scripts/powershell/update-agent-context.ps1 -AgentType __AGENT__
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

## Outline

Migrate a React project from Material UI (MUI) to Modus Web Components. This command scans for MUI usage (components, styling patterns, hooks), compares properties at the component level using the Modus Docs MCP tools, generates reference files, a migration report, a plan, and ordered tasks.

1. **Setup**: Ask the user, then create a migration feature branch and directory.
2. **MUI Scan**: Find all MUI components, styling patterns (`sx`, `styled`, `makeStyles`, `useTheme`), and custom wrappers.
3. **Modus Data Retrieval**: Get full API details for each Modus equivalent via MCP.
4. **Property Comparison**: Compare MUI props vs Modus props for every component pair. Include events, types, compound patterns, and accessibility.
5. **Component Reference Files**: Write per-component reference docs and the comprehensive mapping file.
6. **Migration Report**: Generate `migration.md` with match quality, effort estimates, coexistence plan, and risk assessment.
7. **Migration Scope Selection**: Present property availability, recommend bottom-up (atoms-first) strategy, offer 4 scope options (all / one component / by file / available properties only).
8. **Migration Plan**: Generate `plan.md` scoped to the user's selection.
9. **Migration Tasks**: Generate `tasks.md` with per-file granularity, verification checkpoints per component, and rollback guidance.

## Context Management (large projects)

- If the MUI scan finds **>20 distinct components** or **>100 files with MUI imports**, warn the user that the full analysis may be too large for a single session.
- For large projects, recommend **Option B** (one component at a time) or **Option D** (available properties only) to keep the scope manageable.
- Process MCP data retrieval in batches of 10 components. Write component reference files to disk between batches to free context.
- For `component-mapping.md`, write incrementally (one component section at a time) rather than holding all comparison data before writing.
- If the project has >15 MUI components, generate the migration report and scope selection FIRST, then generate plan and tasks only for the selected scope.

## Phase 1: Setup

**Ask the user** before creating any branches or directories:

```text
Before we begin, I need to set up a feature branch and directory for the migration artifacts.

1. Feature name: I'll use "mui-to-modus-migration" unless you'd like a different name.
2. This will create a branch (e.g., 001-mui-to-modus-migration) and a specs directory.

Shall I proceed? (yes / provide a custom name)
```

Wait for the user's response. Then:

1. Use the name the user provided, or default to `mui-to-modus-migration`.

2. Check for existing branches:

   a. Fetch remote branches:

      ```bash
      git fetch --all --prune
      ```

   b. Find the highest feature number across remote branches, local branches, and `specs/` directories matching the short-name pattern.

   c. Run `{SCRIPT}` with the calculated number and short-name:
      - For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

   d. Parse the JSON output for BRANCH_NAME and SPEC_FILE. Derive FEATURE_DIR from SPEC_FILE's parent directory.

## Phase 2: MUI Scan

1. **Scan for MUI imports** across the entire project source directory. Search for imports from:
   - `@mui/material`
   - `@mui/icons-material`
   - `@mui/lab`
   - `@mui/x-data-grid`
   - `@mui/x-date-pickers`
   - `@mui/system`
   - `@mui/styles` (legacy `makeStyles`/`withStyles` API)
   - Any other `@mui/*` package not listed above -- record as "unrecognized MUI package" for manual review
   - **MUI v4 detection**: Also search for `@material-ui/core`, `@material-ui/lab`, `@material-ui/icons`, `@material-ui/styles`. If found, STOP and warn the user: "This project uses MUI v4 (`@material-ui/*`). We recommend upgrading to MUI v5 (`@mui/*`) first using MUI's official codemods (`npx @mui/codemod@latest v5.0.0/preset-safe`), then re-running `/speckit.migrate`. Proceeding with v4 is possible but will require additional manual mapping."

2. **Build a component inventory**. For each imported MUI component, record:
   - Component name (e.g., `Button`, `TextField`, `DataGrid`)
   - Source package (e.g., `@mui/material`, `@mui/lab`)
   - Files where it is imported (absolute paths)
   - Props used in JSX across all usages (e.g., `variant`, `color`, `onClick`, `sx`)
   - Count of usages across the project

3. **Scan for MUI styling patterns**. These are often the hardest part of migration:
   - **`sx` prop usage**: Count how many components use the `sx` prop. For each, note what CSS properties are set (spacing, colors, layout, typography). These must be converted to Modus design tokens or plain CSS.
   - **`styled()` API**: Search for `import { styled } from '@mui/material/styles'` or `@mui/system`. Record every `styled()` call and which base component it wraps.
   - **`makeStyles` / `withStyles`**: Search for `import { makeStyles } from '@mui/styles'`. These are legacy but common. Record all instances.
   - **`useTheme` hook**: Search for `useTheme()` calls. These access MUI theme values (palette, spacing, breakpoints) that will need Modus equivalents.
   - **`useMediaQuery` hook**: Search for `useMediaQuery()` calls. These use MUI's breakpoint system.
   - **Color utility functions**: Search for imports of `alpha`, `darken`, `lighten`, `emphasize` from `@mui/material/styles` or `@mui/system`. These need replacement with CSS `color-mix()`, `opacity`, or Modus color tokens.
   - **`ThemeProvider` and custom themes**: Find the theme configuration file(s) where `createTheme()` is called. Record:
     - Custom palette colors, spacing overrides, and typography settings
     - **`components` key with `defaultProps`**: These set implicit props on every instance of a component (e.g., `MuiButton: { defaultProps: { variant: 'contained' } }` makes every `<Button>` render as contained even without the prop in JSX). These implicit props MUST be included in the Phase 4 property comparison.
     - **`components` key with `styleOverrides`**: These are global CSS patches per component that need migration to Modus styles or CSS classes.

4. **Scan for custom wrappers**: Search for files that import MUI components and re-export them with modified props or styling. These wrapped components need migration too -- often they are the single point of change (migrate the wrapper, fix all usages).

5. **Detect the React framework setup**:
   - Check for `next.config.*` (Next.js), `vite.config.*` (Vite), `react-scripts` in package.json (CRA)
   - Record the framework, React version, MUI version, and TypeScript version from `package.json`
   - Check for `tsconfig.json` to determine if the project uses TypeScript
   - **Next.js App Router detection**: If Next.js is detected, check for `app/` directory (App Router) vs `pages/` directory (Pages Router). If App Router is found, flag that ALL files importing Modus Web Components will need a `"use client"` directive at the top, because Web Components require client-side hydration and cannot run as React Server Components.

6. **Present scan summary** to the user:

   ```text
   MUI Scan Results:
   - Framework: [Vite / Next.js / CRA]
   - React version: [x.y.z]
   - MUI version: [x.y.z]
   - TypeScript: [yes (x.y.z) / no]
   - MUI packages found: [@mui/material, @mui/icons-material, ...]
   - Total MUI components used: [N]
   - Total files with MUI imports: [N]

   Components found:
   | MUI Component | Package | Files | Usages | Props Used |
   |---------------|---------|-------|--------|------------|
   | Button        | @mui/material | 12 | 34 | variant, color, onClick, disabled, sx |
   | TextField     | @mui/material | 8  | 15 | label, value, onChange, error, helperText |
   | ...           | ...     | ...   | ...    | ... |

   Styling patterns found:
   | Pattern         | Occurrences | Files | Migration Impact |
   |-----------------|-------------|-------|------------------|
   | sx prop         | [N]         | [N]   | Convert to CSS/Modus tokens |
   | styled()        | [N]         | [N]   | Replace with CSS classes |
   | makeStyles      | [N]         | [N]   | Replace with CSS modules or classes |
   | useTheme        | [N]         | [N]   | Replace with Modus CSS variables |
   | useMediaQuery   | [N]         | [N]   | Replace with CSS media queries |
   | Custom wrappers | [N]         | [N]   | Migrate wrapper, fixes all consumers |
   ```

## Phase 3: Modus Component Data Retrieval

1. **Get the Modus catalog**: Call `get_modus_component_data("_all_components")` to get the full list of 45 Modus Web Components.

2. **Match each MUI component** to its Modus equivalent using the reference mapping below (Section: MUI-to-Modus Component Mapping).

3. **Get detailed API for each matched Modus component**: For every MUI component found in Phase 2 that has a Modus equivalent, call `get_modus_component_data("modus-wc-{name}")` to get:
   - All properties (name, type, default value, description)
   - All events (name, detail type, description)
   - All methods (name, parameters, description)
   - All slots (name, description)
   - Usage examples

4. **Get React integration guide**: Call `get_modus_implementation_data("react")` to get:
   - Installation instructions
   - Framework setup and configuration
   - Import patterns
   - Event binding patterns for React

5. **Handle MCP failures**: If `get_modus_component_data` returns no data or an error for a component:
   - Remove that component from the "WITH Modus Equivalent" working list
   - Move it to the "WITHOUT Modus Equivalent" list with strategy: "Verify component availability -- may be renamed, deprecated, or not yet released in Modus"
   - Log the discrepancy in `migration.md` under the Risk Assessment section
   - Do NOT hallucinate prop data -- only use data returned by the MCP tools

## Phase 4: Property-Level Comparison

**CRITICAL**: This phase is what makes migration accurate. The AI must know exactly which props transfer, which need changes, and which have no equivalent.

For EACH MUI component found in Phase 2 that has a Modus equivalent:

1. **List MUI props actually used** in the project (from Phase 2 scan).

2. **List all Modus props available** (from Phase 3 MCP data).

3. **Produce a per-component comparison table**:

   ```text
   ## Button: MUI → modus-wc-button

   ### Props That Map Directly
   | MUI Prop | Modus Prop | Notes |
   |----------|------------|-------|
   | disabled | disabled   | Same behavior |

   ### Props That Map With Changes
   | MUI Prop | Modus Prop | Change Required |
   |----------|------------|-----------------|
   | variant="contained" | button-style="fill" | Value mapping: contained→fill, outlined→outline, text→borderless |
   | color="primary" | color="primary" | Modus supports: primary, secondary, danger only |
   | size="small" | size="small" | Same values: small, medium, large |

   ### Event Handling Changes
   | MUI Event | Modus Event | Migration Pattern |
   |-----------|-------------|-------------------|
   | onClick={(e) => ...} | onButtonClick={(e) => ...} | Rename handler; event detail may differ |

   ### MUI Props With NO Modus Equivalent
   | MUI Prop | Workaround |
   |----------|------------|
   | sx       | Use CSS classes, inline styles, or Modus CSS variables |
   | startIcon | Use left-icon prop or slot |
   | endIcon  | Use right-icon prop or slot |
   | disableElevation | Not applicable (Modus handles elevation via design tokens) |
   | disableRipple | Not applicable (Modus does not use ripple effects) |

   ### New Modus Props Available (not in MUI)
   | Modus Prop | Description |
   |------------|-------------|
   | show-caret | Shows dropdown caret |
   | left-icon  | Built-in left icon prop |
   | right-icon | Built-in right icon prop |

   ### TypeScript Type Changes
   | MUI Type Import | Modus Equivalent |
   |-----------------|------------------|
   | ButtonProps from '@mui/material' | HTMLModusButtonElement attributes |

   ### Accessibility Notes
   | Concern | Status |
   |---------|--------|
   | aria-label | Supported via standard HTML attribute |
   | role="button" | Built-in to modus-wc-button |
   | keyboard navigation | Built-in (Enter/Space) |
   ```

4. **Identify compound component patterns**: MUI often requires multiple components to build one input (e.g., `FormControl` + `InputLabel` + `Select` + `FormHelperText`). Modus consolidates these into a single component with built-in label and helper text props. For each compound pattern found, document:
   - The MUI compound pattern (which components are combined)
   - The Modus single-component replacement
   - How child component props map to the consolidated Modus props

5. **Identify controlled component patterns**: For MUI components using `value` + `onChange` (controlled inputs), document:
   - Whether the Modus equivalent supports the same controlled pattern
   - If the Modus event detail structure differs (e.g., `e.target.value` vs `e.detail.value`)
   - Any two-way binding differences for React integration

6. **Calculate match quality** for each component:
   - **Full match**: >80% of used MUI props have a Modus equivalent
   - **Partial match**: 50-80% of used MUI props have a Modus equivalent
   - **Low match**: <50% of used MUI props have a Modus equivalent

7. **Assign effort level** based on match quality, usage count, and complexity factors:
   - **Low**: Full match + <10 usages + no `sx`/`styled` on this component
   - **Medium**: Partial match, OR full match + >10 usages, OR has `sx`/`styled` patterns
   - **High**: Low match, OR complex state management (controlled inputs, compound patterns), OR >30 usages, OR custom wrapper exists for this component

## Phase 5: Component Reference Files

1. **Create `FEATURE_DIR/modus-components/` directory** with one Markdown file per matched Modus component. Each file contains:
   - Component tag name (e.g., `modus-wc-button`)
   - Complete property table from MCP data (name, type, default, description)
   - Complete events table from MCP data
   - Complete slots table from MCP data
   - Usage examples from MCP data
   - The property comparison from Phase 4 for this specific component

2. **Create `FEATURE_DIR/component-mapping.md`** -- the comprehensive AI context file:
   - Full MUI-to-Modus component mapping table
   - All per-component property comparisons from Phase 4
   - React integration setup steps from MCP data
   - This file is the single source of truth for the AI during implementation

## Phase 6: Migration Report

Generate **`FEATURE_DIR/migration.md`** with:

1. **Project Summary**:
   - Framework, React version, MUI version
   - Total MUI components, total usages, total files affected

2. **Component Migration Table**:

   ```text
   | MUI Component | Modus Component | Match Quality | Effort | Usages | Files |
   |---------------|-----------------|---------------|--------|--------|-------|
   | Button        | modus-wc-button | Full (90%)    | Low    | 34     | 12    |
   | Table         | modus-wc-table  | Partial (55%) | High   | 5      | 3     |
   | Box           | (none)          | N/A           | Medium | 45     | 20    |
   ```

3. **Property Gap Summary** (per component):
   - Count of props that map directly
   - Count of props that need changes
   - Count of props with no equivalent (and workarounds)

4. **Components With No Modus Equivalent**:

   ```text
   | MUI Component | Usages | Migration Strategy |
   |---------------|--------|--------------------|
   | Box           | 45     | Replace with CSS div + Modus design tokens |
   | Grid          | 20     | Replace with CSS Grid layout |
   | Paper         | 8      | Use modus-wc-card or CSS with Modus tokens |
   ```

5. **Styling Migration Summary**:
   - Total `sx` prop usages and affected files
   - Total `styled()` components and their base components
   - Total `makeStyles`/`withStyles` instances
   - Total `useTheme`/`useMediaQuery` hook calls
   - Custom theme overrides that need Modus design token equivalents

6. **Coexistence Plan** (for incremental migration):
   - MUI and Modus WILL run side-by-side during migration. Document:
     - CSS specificity conflicts to watch for (MUI uses Emotion/JSS, Modus uses Shadow DOM)
     - Theme conflicts (MUI ThemeProvider vs Modus theme variables)
     - CSS custom property (design token) collisions: CSS variables pierce Shadow DOM boundaries. Verify that MUI custom theme variables do not collide with Modus token names (`--modus-*` prefixed). MUI typically uses JS-based theming, not CSS custom properties, so conflicts are unlikely but should be verified.
     - Bundle size impact of running both libraries simultaneously
     - Recommended isolation strategy (Modus components use Shadow DOM so internal styles are encapsulated; only CSS custom properties can leak through)

7. **Risk Assessment**:

   ```text
   | Risk | Severity | Mitigation |
   |------|----------|------------|
   | sx prop conversion | [based on count] | Convert to CSS classes using Modus tokens |
   | Custom theme loss | Medium | Map MUI palette to Modus CSS variables |
   | Event handler changes | Low | Systematic rename during component migration |
   | Controlled input behavior | [based on count] | Test each input component individually |
   | Accessibility regression | Medium | Run axe-core before and after each component |
   | Visual regression | Medium | Screenshot comparison per component migration |
   ```

8. **Estimated Total Effort**:
   - Count of Low / Medium / High effort components
   - Styling migration effort (separate from component migration)
   - Suggested migration order (atoms first, bottom-up)

## Phase 7: Migration Scope Selection

**STOP and present the property comparison results first**, then ask the user to choose.

### Step 1: Present Property Availability

Show a clear breakdown of which components CAN be migrated vs which have gaps:

```text
Property Availability Summary:

READY TO MIGRATE (full/partial property match):
| MUI Component | Modus Component       | Props Available | Props Missing | Match |
|---------------|-----------------------|-----------------|---------------|-------|
| Button        | modus-wc-button       | 8/10            | 2             | 80%   |
| Checkbox      | modus-wc-checkbox     | 5/5             | 0             | 100%  |
| Badge         | modus-wc-badge        | 4/4             | 0             | 100%  |
| Switch        | modus-wc-switch       | 3/3             | 0             | 100%  |
| ...           | ...                   | ...             | ...           | ...   |

MIGRATION REQUIRES WORKAROUNDS (low property match):
| MUI Component | Modus Component       | Props Available | Props Missing | Match |
|---------------|-----------------------|-----------------|---------------|-------|
| Table         | modus-wc-table        | 3/12            | 9             | 25%   |
| Autocomplete  | modus-wc-autocomplete | 5/18            | 13            | 28%   |
| ...           | ...                   | ...             | ...           | ...   |

NO MODUS EQUIVALENT:
| MUI Component | Usages | Strategy |
|---------------|--------|----------|
| Box           | 45     | Replace with CSS + Modus tokens |
| Grid          | 20     | Replace with CSS Grid |
| ...           | ...    | ... |
```

### Step 2: Recommend Bottom-Up Migration Strategy

Present this recommendation before asking for scope:

```text
RECOMMENDED MIGRATION STRATEGY: Bottom-Up (Atoms First)

Migration works best when you start with the smallest, simplest components
(atoms) and work your way up to complex ones (organisms). This is because:

- Atoms (Button, Checkbox, Badge, Switch, Radio, Tooltip) have the fewest
  dependencies and highest property match. Quick wins that build confidence.
- Molecules (TextField, Select, Chip, Tabs, Alert) combine atoms and have
  moderate complexity. Migrating after atoms ensures their building blocks
  are already on Modus.
- Organisms (Table, Navbar, Modal, Autocomplete, Drawer) are the most
  complex, with the most props and deepest integration. Migrate last.

Suggested order for your project:
  1. [list atoms found, sorted by usage count]
  2. [list molecules found, sorted by usage count]
  3. [list organisms found, sorted by usage count]
```

### Step 3: Ask for Migration Scope

```text
How would you like to proceed?

A) Migrate ALL components
   Generate a plan and tasks covering every MUI component found.
   Best for: Small projects or full rewrites.

B) Migrate ONE component at a time
   Pick a single component to migrate across the entire project.
   Best for: Incremental adoption, low-risk rollout.
   Re-run /speckit.migrate to migrate the next component.

C) Migrate by FILE or PAGE
   Pick a specific file or set of files to migrate.
   Best for: Page-by-page migration, feature-team ownership.

D) Migrate only components with AVAILABLE PROPERTIES
   Skip components with low property match (<50%).
   Only migrate components where Modus has equivalent props.
   Best for: Getting maximum coverage with minimum workarounds.

Your choice (A/B/C/D):
```

- **If A**: Proceed with all components, ordered bottom-up (atoms first).
- **If B**: Present the list of detected components grouped by complexity tier (atoms/molecules/organisms), recommend starting with atoms. Ask the user to pick one. Proceed with only that component.
- **If C**: Present the list of files with MUI imports and ask the user to pick one or more. Proceed with only the components used in those files.
- **If D**: Filter to only components with >=50% property match from Phase 4. Proceed with those components, ordered bottom-up.

Wait for the user's response before proceeding.

## Phase 8: Migration Plan

Generate **`FEATURE_DIR/plan.md`** using the structure defined below (not the standard `plan-template.md`, which is designed for new features, not migrations):

1. **Summary**: "Migrate [selected scope] from Material UI to Modus Web Components."

2. **Technical Context**:
   - Language/Version: React [version], TypeScript/JavaScript
   - Primary Dependencies: Modus Web Components, [detected framework]
   - Testing: [detected test framework from package.json]
   - Target Platform: Web

3. **Component Mapping section**: Populated from Phase 4/5 data. Include the per-component property comparison tables. Reference `migration.md` and `component-mapping.md`.

4. **Project Structure**: Based on the detected project layout.

5. If the user chose Option B, C, or D, scope the plan to only the selected components/files.

## Phase 9: Migration Tasks

Generate **`FEATURE_DIR/tasks.md`** using the structure defined below (adapted from `tasks-template.md` for migration context).

**Ordering rule (Bottom-Up / Atoms First)**:
- **Tier 1 - Atoms**: Button, Checkbox, Radio, Switch, Badge, Tooltip, Divider, Skeleton, Rating, Chip, Slider, Progress, Loader, Typography, Icon
- **Tier 2 - Molecules**: TextField/TextInput, Textarea, NumberInput, Select, Alert, Tabs, Accordion, Breadcrumbs, Pagination, Stepper, Toast, InputLabel, InputFeedback
- **Tier 3 - Organisms**: Table, Modal, Navbar, Autocomplete, SideNavigation, Card, DropdownMenu, DatePicker, TimePicker, Menu, FileDropzone

Migrate Tier 1 first (quick wins, highest prop match), then Tier 2, then Tier 3. Within each tier, migrate components with the fewest usages first.

**Note on `[USn]` labels**: In migration context, each `[USn]` maps to a component migration scope (e.g., `[US1]` = Button migration, `[US2]` = Checkbox migration), not a user story. This keeps compatibility with `/speckit.implement` which reads `[USn]` labels for progress tracking.

### Phase 1: Setup

- [ ] T001 Install Modus Web Components and framework wrapper:
  - React: `npm install @trimble-oss/moduswebcomponents @trimble-oss/moduswebcomponents-react`
  - Angular: `npm install @trimble-oss/moduswebcomponents @trimble-oss/moduswebcomponents-angular`
  - Vue: `npm install @trimble-oss/moduswebcomponents @trimble-oss/moduswebcomponents-vue`
- [ ] T002 Configure Modus Web Components for the detected framework (follow `get_modus_implementation_data("react")` guide)
- [ ] T003 [P] Add Modus CSS/theme imports to the application entry point
- [ ] T004 [P] If Next.js App Router detected: add `"use client"` directive to a shared Modus wrapper component or ensure all files importing Modus components have it
- [ ] T005 [P] Create a Modus design token mapping file that maps MUI custom theme values to Modus CSS variables (reference the MUI `createTheme()` config found in Phase 2)

### Phase 2: Foundational (Styling Infrastructure)

- [ ] T006 Map MUI custom theme palette colors to Modus CSS custom properties in a shared stylesheet
- [ ] T007 Create CSS utility classes to replace common `sx` prop patterns (spacing, flexbox, display)
- [ ] T008 [P] Replace `makeStyles`/`withStyles` calls with CSS modules or Modus-compatible styles (list every file from Phase 2 scan)
- [ ] T009 [P] Replace `styled()` component wrappers with CSS classes or Modus component props (list every file from Phase 2 scan)
- [ ] T010 [P] Replace `useTheme()` calls with Modus CSS variable references (list every file)
- [ ] T011 [P] Replace `useMediaQuery()` calls with CSS media queries or `window.matchMedia` (list every file)

**Checkpoint**: Styling infrastructure is ready. MUI ThemeProvider still active (will be removed in cleanup). Both libraries can coexist.

### Phase 3+: Component Migrations (one phase per component, atoms first)

For each component in the selected scope, generate a phase. Each phase MUST include ALL of these task types:

**Step A: Prepare** (understand what changes)

- [ ] TXXX [USn] Review property comparison for [Component] in `component-mapping.md` -- confirm all prop mappings are accurate for this project's usage

**Step B: Migrate imports** (file by file)

For each file that uses this component, generate a separate task:

- [ ] TXXX [P] [USn] Migrate [Component] in `[src/path/File1.tsx]`: replace import, rename component tag, map [N] props per comparison table
- [ ] TXXX [P] [USn] Migrate [Component] in `[src/path/File2.tsx]`: replace import, rename component tag, map [N] props per comparison table

**Step C: Handle event binding changes**

- [ ] TXXX [USn] Update event handlers for [Component]: [list each MUI event → Modus event rename, e.g., onClick → onButtonClick, onChange → onValueChange]
- [ ] TXXX [USn] Update controlled component patterns: replace `e.target.value` with `e.detail.value` where Modus custom events differ

**Step D: Handle props with no equivalent**

- [ ] TXXX [USn] Replace `sx` prop usages on [Component] with CSS classes or inline styles ([N] instances in [N] files)
- [ ] TXXX [USn] Handle missing props: [list each MUI prop with no Modus equivalent and its specific workaround from Phase 4]

**Step E: Handle compound component consolidation** (if applicable)

- [ ] TXXX [USn] Consolidate MUI compound pattern (FormControl + InputLabel + [Component] + FormHelperText) into single Modus component with label/helper-text props in [file list]

**Step F: Update types** (if TypeScript project)

- [ ] TXXX [P] [USn] Update TypeScript types: replace MUI type imports (e.g., `ButtonProps`) with Modus element types in [file list]

**Step G: Update tests**

- [ ] TXXX [USn] Update unit tests for [Component] in [test file paths]: update selectors, event simulation, and assertions to match Modus component API
- [ ] TXXX [USn] Update integration/E2E tests if they reference [Component] by MUI-specific selectors

**Step H: Verify (per-component checkpoint)**

- [ ] TXXX [USn] Verify [Component] renders correctly in all migrated files -- visual check
- [ ] TXXX [USn] Verify accessibility: run axe-core or similar on pages using migrated [Component] -- confirm no ARIA regressions
- [ ] TXXX [USn] Run test suite and confirm no regressions from [Component] migration

**Checkpoint**: [Component] migration complete. MUI and Modus coexist for remaining components. Commit this checkpoint.

### Phase N-1: Layout Components (no Modus equivalent)

For MUI layout components (Box, Grid, Container, Stack, Paper) that have no Modus counterpart:

- [ ] TXXX [P] Replace `<Box>` with `<div>` and convert `sx` props to CSS classes using Modus spacing tokens in [file list]
- [ ] TXXX [P] Replace `<Grid>` with CSS Grid or Flexbox layout in [file list]
- [ ] TXXX [P] Replace `<Container>` with a CSS max-width wrapper in [file list]
- [ ] TXXX [P] Replace `<Stack>` with CSS flexbox (`display: flex; gap: ...`) in [file list]
- [ ] TXXX [P] Replace `<Paper>` with `<modus-wc-card>` or a `<div>` with Modus elevation CSS variables in [file list]

### Final Phase: Cleanup and Validation

- [ ] TXXX Remove MUI ThemeProvider and `createTheme()` configuration
- [ ] TXXX Remove MUI CssBaseline component
- [ ] TXXX Remove unused `@mui/material` from package.json (only if ALL MUI material components are migrated)
- [ ] TXXX Remove unused `@mui/icons-material` from package.json (only if all icons migrated to `modus-wc-icon`)
- [ ] TXXX Remove unused `@mui/lab` from package.json (only if all lab components migrated)
- [ ] TXXX Remove unused `@mui/x-*` packages from package.json (only if applicable components migrated)
- [ ] TXXX Remove `@mui/styles` if all `makeStyles`/`withStyles` have been replaced
- [ ] TXXX Remove `@emotion/react` and `@emotion/styled` if no longer needed (MUI's CSS-in-JS runtime)
- [ ] TXXX Run full test suite -- all tests must pass
- [ ] TXXX Run accessibility audit on all migrated pages (axe-core or Lighthouse)
- [ ] TXXX Visual spot-check: compare key pages before/after migration for layout or styling regressions
- [ ] TXXX Update project README and documentation to reference Modus Web Components instead of MUI
- [ ] TXXX Verify production build succeeds with no MUI-related warnings

**Rollback note**: If any component migration causes regressions that cannot be resolved, revert that component's changes using `git checkout` on the affected files. The coexistence strategy means partially-migrated projects are valid -- MUI and Modus can run together indefinitely.

If the user chose Option B, C, or D, only generate tasks for the selected scope and skip the Final Phase (since MUI packages are still needed for remaining components). Include a note that the user can re-run `/speckit.migrate` to continue migrating the next component or set of files.

## Re-run Behavior (for incremental migration)

When `/speckit.migrate` is re-run on a project that already has migration artifacts:

1. **Detect existing FEATURE_DIR** -- if `specs/*-mui-to-modus-migration/` already exists, skip Phase 1 (Setup). Do NOT create a new branch or directory.
2. **Re-scan for remaining MUI imports** -- exclude components already marked as COMPLETE in `migration.md`.
3. **Append to `component-mapping.md`** -- add new component sections under a dated header (e.g., `## Migration Pass 2 - [DATE]`). Do not overwrite existing sections.
4. **Update `migration.md`** -- mark previously migrated components as COMPLETE in the Component Migration Table. Add new components to the table.
5. **Continue task numbering** -- read the highest existing task ID in `tasks.md` (e.g., T045) and continue from the next number (T046). Do NOT restart from T001.
6. **Skip Phase 1/2 setup tasks** -- Modus is already installed and configured. Generate only component migration phases and verification tasks.
7. **Skip Final Phase cleanup** -- unless the user explicitly requests it or all MUI components have been migrated.

## Report

After generating all artifacts, present:

```text
Migration artifacts generated:
  Branch: [branch name]
  Feature dir: [FEATURE_DIR]

  Files created:
  - migration.md          (migration report with property comparisons)
  - component-mapping.md  (full AI reference for implementation)
  - modus-components/     ([N] component reference files)
  - plan.md               (migration plan)
  - tasks.md              (ordered migration tasks)

  Scope: [All components / Component: Button / Files: src/pages/Dashboard.tsx]
  Total tasks: [N]
  Estimated effort: [N low, N medium, N high]

  Next: Run /speckit.implement to begin the migration.
```

## MUI-to-Modus Component Mapping Reference

This is the built-in reference the AI uses to match MUI imports to Modus replacements.

### Components WITH a Modus Equivalent

| MUI Component(s) | MUI Package | Modus Component | Effort | Notes |
|---|---|---|---|---|
| Accordion, AccordionSummary, AccordionDetails | @mui/material | modus-wc-accordion | Medium | Modus uses slots instead of sub-components |
| Alert, AlertTitle | @mui/material | modus-wc-alert | Low | severity prop maps to type |
| Autocomplete | @mui/material | modus-wc-autocomplete | High | Different data binding and option rendering |
| Avatar | @mui/material | modus-wc-avatar | Low | Direct prop mapping |
| Badge | @mui/material | modus-wc-badge | Low | Direct prop mapping |
| Breadcrumbs | @mui/material | modus-wc-breadcrumbs | Low | Direct mapping |
| Button, IconButton, LoadingButton | @mui/material, @mui/lab | modus-wc-button | Low | variant/color props differ |
| Card, CardContent, CardActions, CardHeader, CardMedia | @mui/material | modus-wc-card | Medium | Modus uses slots instead of sub-components |
| Checkbox, FormControlLabel (checkbox) | @mui/material | modus-wc-checkbox | Low | Direct mapping |
| Chip | @mui/material | modus-wc-chip | Low | Direct mapping |
| Collapse | @mui/material | modus-wc-collapse | Low | Direct mapping |
| DatePicker, DateField | @mui/x-date-pickers | modus-wc-date | High | Different date handling API |
| Divider | @mui/material | modus-wc-divider | Low | Direct mapping |
| Menu, MenuItem, PopoverMenu | @mui/material | modus-wc-dropdown-menu | Medium | Different trigger/anchor pattern |
| FormHelperText | @mui/material | modus-wc-input-feedback | Low | Direct mapping |
| FormLabel, InputLabel | @mui/material | modus-wc-input-label | Low | Direct mapping |
| Icon, SvgIcon | @mui/material, @mui/icons-material | modus-wc-icon | Medium | Different icon set (Modus icons vs MUI icons) |
| CircularProgress (spinner) | @mui/material | modus-wc-loader | Low | Map variant to loader type |
| List, ListItem, ListItemButton, ListItemText | @mui/material | modus-wc-menu, modus-wc-menu-item | Medium | Different component structure |
| Dialog, DialogTitle, DialogContent, DialogActions, Modal | @mui/material | modus-wc-modal | Medium | Modus uses slots; MUI uses sub-components |
| AppBar, Toolbar (as nav) | @mui/material | modus-wc-navbar | High | Different structure, Modus navbar is opinionated |
| TextField (type="number") | @mui/material | modus-wc-number-input | Medium | Separate component in Modus |
| Pagination, TablePagination | @mui/material | modus-wc-pagination | Medium | Different event and prop API |
| LinearProgress, CircularProgress (bar) | @mui/material | modus-wc-progress | Low | Map variant to Modus type |
| Radio, RadioGroup, FormControlLabel (radio) | @mui/material | modus-wc-radio | Low | Direct mapping |
| Rating | @mui/material | modus-wc-rating | Low | Direct mapping |
| Select, NativeSelect, FormControl+Select | @mui/material | modus-wc-select | Medium | Different option rendering |
| Drawer, SwipeableDrawer | @mui/material | modus-wc-side-navigation | High | Different navigation model |
| Skeleton | @mui/material | modus-wc-skeleton | Low | Direct mapping |
| Slider | @mui/material | modus-wc-slider | Medium | Event handling differs |
| Stepper, Step, StepLabel, StepContent | @mui/material | modus-wc-stepper | Medium | Different step model |
| Switch, FormControlLabel (switch) | @mui/material | modus-wc-switch | Low | Direct mapping |
| Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel | @mui/material | modus-wc-table | High | Completely different data model (declarative vs prop-driven) |
| DataGrid, DataGridPro | @mui/x-data-grid | modus-wc-table | High | Major API difference |
| Tabs, Tab, TabContext, TabList, TabPanel | @mui/material, @mui/lab | modus-wc-tabs | Medium | Different tab panel management |
| TextField, Input, OutlinedInput, FilledInput | @mui/material | modus-wc-text-input | Medium | Consolidates MUI's many input variants |
| TextField (multiline), TextareaAutosize | @mui/material | modus-wc-textarea | Medium | Separate component in Modus |
| TimePicker, TimeField | @mui/x-date-pickers | modus-wc-time-input | High | Different time handling API |
| Snackbar, Snackbar+Alert | @mui/material | modus-wc-toast | Medium | Different positioning/stacking API |
| Toolbar (standalone) | @mui/material | modus-wc-toolbar | Low | Direct mapping |
| Tooltip | @mui/material | modus-wc-tooltip | Low | Direct mapping |
| Typography | @mui/material | modus-wc-typography | Low | Variant names differ |

### Modus Components WITHOUT a MUI Equivalent

These are Modus-only components available to enhance the migrated application:

| Modus Component | Purpose |
|---|---|
| modus-wc-file-dropzone | File upload drag-and-drop zone |
| modus-wc-theme-switcher | Toggle between light/dark Modus themes |
| modus-wc-utility-panel | Collapsible side utility panel |
| modus-wc-handle | Drag handle for resizable panels |

### MUI Components WITHOUT a Modus Equivalent

These MUI components require custom implementation or replacement:

| MUI Component | Migration Strategy |
|---|---|
| Backdrop | Use CSS overlay or modus-wc-modal backdrop |
| BottomNavigation | Replace with modus-wc-tabs or modus-wc-side-navigation |
| Box, Container, Stack, Grid | Replace with CSS layout (flexbox/grid) with Modus spacing tokens |
| CssBaseline | Remove; Modus theme handles base styles |
| Fab (FloatingActionButton) | Use modus-wc-button with custom CSS positioning |
| ImageList | Custom CSS grid layout |
| InputAdornment | Built into modus-wc-text-input (prefix/suffix slots) |
| Link | Standard anchor tag with Modus typography styles |
| Paper | Use modus-wc-card or CSS with Modus elevation tokens |
| Popover, Popper | Use modus-wc-tooltip or modus-wc-dropdown-menu |
| SpeedDial | Custom implementation with modus-wc-button |
| ToggleButton, ToggleButtonGroup | Use modus-wc-button with active/toggle state |
| Timeline (@mui/lab) | No equivalent; custom implementation needed |
| TreeView (@mui/lab) | No equivalent; custom implementation needed |
| Masonry (@mui/lab) | CSS masonry layout |

## Key Rules

- Use absolute paths for all file references.
- Call MCP tools for EVERY matched Modus component -- do not rely on the reference mapping alone for prop details. The MCP data is the source of truth for current props, events, and slots.
- NEVER skip the property comparison phase -- it is the foundation for accurate migration.
- NEVER assume a prop exists in Modus just because it exists in MUI. Always verify via MCP data.
- Generate one task per file for component migrations -- "migrate Button across 15 files" is not actionable; "migrate Button in src/pages/Dashboard.tsx" is.
- Commit after each component migration checkpoint. This enables clean rollback if a later migration causes issues.
- MUI and Modus CAN coexist in the same project during incremental migration. The migration does not need to be all-or-nothing.
- If Modus MCP tools do not provide sufficient information about design patterns, layout guidelines, or component usage, ASK the user: "I'd like to reference https://modus.trimble.com/ for additional Modus design system guidance. May I proceed?" Only consult the website after user confirmation.
- If the user chose Option B, C, or D in scope selection, remember to scope all subsequent artifacts accordingly.
- If the user re-runs `/speckit.migrate` for additional components, check for an existing migration feature directory and append to the existing artifacts rather than creating new ones.
