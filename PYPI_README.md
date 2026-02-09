# Trimble Spec Kit

Spec-Driven Development toolkit with Modus Web Components integration. Uses AI agents to turn specifications into working code with Modus as the default design system.

## Install

```bash
pip install trimble-spec-kit
```

## Quick Start

```bash
speckit init my-app --ai cursor
cd my-app
```

Then open the project in your AI agent (Cursor, Claude Code, Copilot, etc.) and run:

1. `/speckit.specify` - Describe what you want to build
2. `/speckit.plan` - Generate a technical plan (auto-maps UI to Modus components)
3. `/speckit.tasks` - Break the plan into tasks
4. `/speckit.implement` - Build it

## Supported AI Agents

cursor, claude, copilot, gemini, windsurf, codex, opencode, qwen, kilocode, auggie, roo, codebuddy, qoder, amp, shai, q, bob

```bash
speckit init my-app --ai claude
speckit init my-app --ai copilot
```

## Modus Web Components

The toolkit automatically configures the Modus Docs MCP server for your AI agent. During planning and implementation, the agent queries Modus component documentation to map your requirements to the right components.

TrimbleID authentication is required on first use. You will be prompted to sign in via your browser.

## Keeping Up to Date

```bash
pip install --upgrade trimble-spec-kit
```
