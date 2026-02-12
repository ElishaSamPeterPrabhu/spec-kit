#!/usr/bin/env node

/**
 * Trimble Spec Kit CLI
 *
 * Minimal Node.js CLI that bootstraps projects with the Spec-Driven Development
 * toolkit and Modus Web Components integration.
 *
 * Usage:
 *   speckit init <project-name> [--ai <agent>] [--here] [--force]
 *   speckit check
 *   speckit version
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const VERSION = require('../package.json').version;
const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');
const MEMORY_DIR = path.join(__dirname, '..', 'memory');
const EXTENSIONS_DIR = path.join(__dirname, '..', 'extensions');

const SUPPORTED_AGENTS = {
  'claude':       { name: 'Claude Code',       folder: '.claude/commands/',      format: 'md' },
  'gemini':       { name: 'Gemini CLI',         folder: '.gemini/commands/',      format: 'toml' },
  'copilot':      { name: 'GitHub Copilot',     folder: '.github/agents/',        format: 'md' },
  'cursor-agent': { name: 'Cursor',             folder: '.cursor/commands/',      format: 'md' },
  'qwen':         { name: 'Qwen Code',          folder: '.qwen/commands/',        format: 'toml' },
  'opencode':     { name: 'opencode',           folder: '.opencode/command/',     format: 'md' },
  'codex':        { name: 'Codex CLI',          folder: '.codex/commands/',       format: 'md' },
  'windsurf':     { name: 'Windsurf',           folder: '.windsurf/workflows/',   format: 'md' },
  'kilocode':     { name: 'Kilo Code',          folder: '.kilocode/rules/',       format: 'md' },
  'auggie':       { name: 'Auggie CLI',         folder: '.augment/rules/',        format: 'md' },
  'roo':          { name: 'Roo Code',           folder: '.roo/rules/',            format: 'md' },
  'codebuddy':    { name: 'CodeBuddy CLI',      folder: '.codebuddy/commands/',   format: 'md' },
  'qoder':        { name: 'Qoder CLI',          folder: '.qoder/commands/',       format: 'md' },
  'q':            { name: 'Amazon Q Developer', folder: '.amazonq/prompts/',      format: 'md' },
  'amp':          { name: 'Amp',                folder: '.agents/commands/',       format: 'md' },
  'shai':         { name: 'SHAI',               folder: '.shai/commands/',         format: 'md' },
  'bob':          { name: 'IBM Bob',            folder: '.bob/commands/',          format: 'md' },
};

function printUsage() {
  console.log(`
Trimble Spec Kit v${VERSION}

Usage:
  speckit init <project-name> [options]    Initialize a new project
  speckit init . [options]                 Initialize in current directory
  speckit init --here [options]            Initialize in current directory
  speckit check                            Check for installed tools
  speckit version                          Show version

Options:
  --ai <agent>       AI agent: ${Object.keys(SUPPORTED_AGENTS).join(', ')}
  --here             Initialize in current directory
  --force            Force overwrite in non-empty directory
  --no-git           Skip git initialization
  --help, -h         Show this help message

Examples:
  speckit init my-app --ai cursor-agent
  speckit init . --ai claude --force
  speckit init --here --ai copilot
`);
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function generateCommands(projectDir, agent, scriptVariant) {
  const agentConfig = SUPPORTED_AGENTS[agent];
  if (!agentConfig) return;

  const commandsDir = path.join(TEMPLATES_DIR, 'commands');
  const targetDir = path.join(projectDir, '.specify', agentConfig.folder);
  fs.mkdirSync(targetDir, { recursive: true });

  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const name = file.replace('.md', '');
    const content = fs.readFileSync(path.join(commandsDir, file), 'utf8');

    const outName = `speckit.${name}.${agentConfig.format}`;
    const outPath = path.join(targetDir, outName);

    if (agentConfig.format === 'toml') {
      // Extract description from frontmatter
      const descMatch = content.match(/^description:\s*(.+)$/m);
      const desc = descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : `speckit ${name}`;
      // Strip YAML frontmatter for prompt
      const body = content.replace(/^---[\s\S]*?---\n*/, '');
      const prompt = body.replace(/\$ARGUMENTS/g, '{{args}}');
      fs.writeFileSync(outPath, `description = "${desc}"\n\nprompt = """\n${prompt}\n"""\n`);
    } else {
      // Markdown format - write as-is with $ARGUMENTS
      fs.writeFileSync(outPath, content);
    }
  }
}

function setupMcpConfig(projectDir) {
  const mcpSource = path.join(TEMPLATES_DIR, 'mcp-configs', 'mcp-standard.json');
  if (!fs.existsSync(mcpSource)) return;

  const mcpContent = fs.readFileSync(mcpSource, 'utf8');

  // Write to standard locations
  const targets = [
    '.mcp.json',
    '.cursor/mcp.json',
    '.claude/mcp.json',
    '.gemini/mcp.json',
  ];

  for (const target of targets) {
    const targetPath = path.join(projectDir, target);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    if (fs.existsSync(targetPath)) {
      // Merge with existing - don't overwrite
      try {
        const existing = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
        const incoming = JSON.parse(mcpContent);
        if (!existing.mcpServers) existing.mcpServers = {};
        Object.assign(existing.mcpServers, incoming.mcpServers || {});
        fs.writeFileSync(targetPath, JSON.stringify(existing, null, 2) + '\n');
      } catch {
        fs.writeFileSync(targetPath, mcpContent);
      }
    } else {
      fs.writeFileSync(targetPath, mcpContent);
    }
  }
}

function init(args) {
  let projectName = null;
  let ai = null;
  let here = false;
  let force = false;
  let noGit = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ai' && args[i + 1]) {
      ai = args[++i];
    } else if (args[i] === '--here') {
      here = true;
    } else if (args[i] === '--force') {
      force = true;
    } else if (args[i] === '--no-git') {
      noGit = true;
    } else if (!args[i].startsWith('--')) {
      projectName = args[i];
    }
  }

  // Determine project directory
  let projectDir;
  if (here || projectName === '.') {
    projectDir = process.cwd();
  } else if (projectName) {
    projectDir = path.resolve(projectName);
  } else {
    console.error('Error: Please provide a project name or use --here');
    process.exit(1);
  }

  // Check if directory exists and is non-empty
  if (fs.existsSync(projectDir) && fs.readdirSync(projectDir).length > 0) {
    if (!here && projectName !== '.' && !force) {
      console.error(`Error: Directory "${projectDir}" already exists and is not empty. Use --force to overwrite.`);
      process.exit(1);
    }
  }

  // Create project directory
  fs.mkdirSync(projectDir, { recursive: true });

  const specifyDir = path.join(projectDir, '.specify');
  console.log(`\nInitializing Trimble Spec Kit v${VERSION} in ${projectDir}\n`);

  // Copy templates
  console.log('  Copying templates...');
  copyDirSync(TEMPLATES_DIR, path.join(specifyDir, 'templates'));

  // Copy scripts
  console.log('  Copying scripts...');
  copyDirSync(SCRIPTS_DIR, path.join(specifyDir, 'scripts'));

  // Copy memory (constitution template)
  console.log('  Setting up memory...');
  copyDirSync(MEMORY_DIR, path.join(specifyDir, 'memory'));

  // Make scripts executable
  const bashDir = path.join(specifyDir, 'scripts', 'bash');
  if (fs.existsSync(bashDir)) {
    const scripts = fs.readdirSync(bashDir).filter(f => f.endsWith('.sh'));
    for (const script of scripts) {
      try {
        fs.chmodSync(path.join(bashDir, script), 0o755);
      } catch { /* ignore chmod errors on Windows */ }
    }
  }

  // Setup MCP config
  console.log('  Configuring Modus Docs MCP server...');
  setupMcpConfig(projectDir);

  // Generate agent commands if --ai specified
  if (ai) {
    if (!SUPPORTED_AGENTS[ai]) {
      console.error(`\nError: Unknown AI agent "${ai}". Supported: ${Object.keys(SUPPORTED_AGENTS).join(', ')}`);
      process.exit(1);
    }
    console.log(`  Generating commands for ${SUPPORTED_AGENTS[ai].name}...`);
    generateCommands(projectDir, ai, 'sh');
  }

  // Initialize git
  if (!noGit) {
    try {
      execSync('git rev-parse --git-dir', { cwd: projectDir, stdio: 'ignore' });
      console.log('  Git repository already initialized.');
    } catch {
      try {
        execSync('git init', { cwd: projectDir, stdio: 'ignore' });
        console.log('  Initialized git repository.');
      } catch {
        console.log('  Warning: git not found, skipping git init.');
      }
    }
  }

  console.log(`\n  Done! Project initialized at ${projectDir}`);
  console.log(`\n  Next steps:`);
  console.log(`    1. Open the project in your AI agent`);
  console.log(`    2. Run /speckit.constitution to set project principles`);
  console.log(`    3. Run /speckit.specify to create your first feature spec`);
  console.log('');
}

function check() {
  console.log(`\nTrimble Spec Kit v${VERSION} - Tool Check\n`);

  const tools = [
    { name: 'git', cmd: 'git --version' },
    { name: 'node', cmd: 'node --version' },
    { name: 'npm', cmd: 'npm --version' },
  ];

  // Add AI agent tools
  for (const [key, config] of Object.entries(SUPPORTED_AGENTS)) {
    tools.push({ name: `${config.name} (${key})`, cmd: `${key} --version` });
  }

  for (const tool of tools) {
    try {
      const version = execSync(tool.cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      console.log(`  ✓ ${tool.name}: ${version}`);
    } catch {
      console.log(`  ✗ ${tool.name}: not found`);
    }
  }
  console.log('');
}

// Main
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  printUsage();
} else if (command === 'init') {
  init(args.slice(1));
} else if (command === 'check') {
  check();
} else if (command === 'version' || command === '--version' || command === '-v') {
  console.log(`trimble-spec-kit v${VERSION}`);
} else {
  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}
