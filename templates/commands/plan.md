---
description: Execute the implementation planning workflow using the plan template to generate design artifacts.
handoffs: 
  - label: Create Tasks
    agent: speckit.tasks
    prompt: Break the plan into tasks
    send: true
  - label: Create Checklist
    agent: speckit.checklist
    prompt: Create a checklist for the following domain...
tools:
  - 'modus-docs/get_modus_component_data'
  - 'modus-docs/get_modus_implementation_data'
scripts:
  sh: scripts/bash/setup-plan.sh --json
  ps: scripts/powershell/setup-plan.ps1 -Json
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

1. **Setup**: Run `{SCRIPT}` from repo root and parse JSON for FEATURE_SPEC, IMPL_PLAN, SPECS_DIR, BRANCH. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot' (or double-quote if possible: "I'm Groot").

2. **Load context**: Read FEATURE_SPEC and `/memory/constitution.md`. Load IMPL_PLAN template (already copied).

3. **Execute plan workflow**: Follow the structure in IMPL_PLAN template to:
   - Fill Technical Context (mark unknowns as "NEEDS CLARIFICATION")
   - Fill Constitution Check section from constitution
   - Evaluate gates (ERROR if violations unjustified)
   - Phase 0: Generate research.md (resolve all NEEDS CLARIFICATION)
   - Phase 1: Generate data-model.md, contracts/, quickstart.md
   - Phase 1: Update agent context by running the agent script
   - Re-evaluate Constitution Check post-design

4. **Stop and report**: Command ends after Phase 2 planning. Report branch, IMPL_PLAN path, and generated artifacts.

## Phases

### Phase 0: Outline & Research

1. **Extract unknowns from Technical Context** above:
   - For each NEEDS CLARIFICATION → research task
   - For each dependency → best practices task
   - For each integration → patterns task

2. **Generate and dispatch research agents**:

   ```text
   For each unknown in Technical Context:
     Task: "Research {unknown} for {feature context}"
   For each technology choice:
     Task: "Find best practices for {tech} in {domain}"
   ```

3. **Consolidate findings** in `research.md` using format:
   - Decision: [what was chosen]
   - Rationale: [why chosen]
   - Alternatives considered: [what else evaluated]

**Output**: research.md with all NEEDS CLARIFICATION resolved

### Phase 1: Design & Contracts

**Prerequisites:** `research.md` complete

1. **Extract entities from feature spec** → `data-model.md`:
   - Entity name, fields, relationships
   - Validation rules from requirements
   - State transitions if applicable

2. **Generate API contracts** from functional requirements:
   - For each user action → endpoint
   - Use standard REST/GraphQL patterns
   - Output OpenAPI/GraphQL schema to `/contracts/`

3. **Agent context update**:
   - Run `{AGENT_SCRIPT}`
   - These scripts detect which AI agent is in use
   - Update the appropriate agent-specific context file
   - Add only new technology from current plan
   - Preserve manual additions between markers

**Output**: data-model.md, /contracts/*, quickstart.md, agent-specific file

### Phase 1.5: UI Component Mapping (if frontend/UI project)

**Prerequisites:** Phase 1 complete, Technical Context indicates a frontend/UI project

**Skip this phase entirely if the project has no user-facing UI.**

1. **Query available Modus components**:
   - Call `get_modus_component_data("_all_components")` to get the full catalog of Modus Web Components
   - Review the list of 45+ available components

2. **Map functional requirements to Modus components**:
   - For each UI-related functional requirement from the spec, identify which Modus component(s) satisfy it
   - For each mapped component, call `get_modus_component_data("modus-wc-{name}")` to get its full API (properties, events, methods, slots)
   - Record the mapping in the Component Mapping section of plan.md

3. **Get framework integration guide**:
   - Based on the detected framework (React, Angular, or Vue), call `get_modus_implementation_data("{framework}")` to get setup and integration instructions
   - Record framework-specific setup steps in research.md

4. **Identify gaps**:
   - List any UI requirements that cannot be satisfied by existing Modus components
   - For gaps, document which custom components are needed and why

5. **Design system reference**:
   - If Modus MCP tools do not provide sufficient information about design patterns, layout guidelines, or component usage best practices, ASK the user: "I'd like to reference https://modus.trimble.com/ for additional Modus design system guidance. May I proceed?"
   - Only consult the website after receiving user confirmation

**Output**: Component Mapping section in plan.md, framework setup in research.md

## Key rules

- Use absolute paths
- ERROR on gate failures or unresolved clarifications
