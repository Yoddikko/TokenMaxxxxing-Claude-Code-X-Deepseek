const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile, spawn } = require("child_process");

const CONFIG_DIR = path.join(os.homedir(), ".ccds-desktop");
const KEY_FILE = path.join(CONFIG_DIR, "deepseek.key");
const MODE_FILE = path.join(CONFIG_DIR, "mode");
const PID_FILE = path.join(CONFIG_DIR, "claude.pid");
const SKILLS_DIR_FILE = path.join(CONFIG_DIR, "skills-dir");
const PROJECT_DIR_FILE = path.join(CONFIG_DIR, "project-dir");

const BASE_URL = "https://api.deepseek.com/anthropic";
const FLASH_MODEL = "deepseek-v4-flash";
const PRO_MODEL = "deepseek-v4-pro";
const DEFAULT_SKILLS_DIR = path.join(os.homedir(), ".claude", "skills");
const DEFAULT_PROJECT_DIR = process.cwd();


const TOKEN_EFFICIENT_CLAUDE_MD = `# Approach

- Read existing files before writing. Don't re-read unless changed.
- Thorough in reasoning, concise in output.
- Skip files over 100KB unless required.
- No sycophantic openers or closing fluff.
- No emojis or em-dashes.
- Do not guess APIs, versions, flags, commit SHAs, or package names. Verify by reading code or docs before asserting.

# Token-max setup

- Prefer installed Claude Code Skills for compact execution-focused work.
- Use the Caveman skill when the task benefits from terse status updates, minimal framing, and low conversational overhead.
- Use the Context Compaction skill to call /compact before long multi-step tasks when history is noisy.
- Use the Plan Mode skill for architecture-first execution on complex work.
- Use the Dynamic Model Selection skill to map heavy reasoning to Pro and high-volume subprocess work to Flash.
- Keep responses short unless the user explicitly asks for detail.
- Do not trade correctness, verification, or safety for brevity.
`;

const BUNDLED_SKILLS = [
  {
    id: "caveman",
    name: "Caveman",
    description: "A compact Claude Code communication style for execution-focused work.",
    folderName: "caveman",
    fileName: "SKILL.md",
    content: `---
name: caveman
description: Use a terse, execution-focused communication style for Claude Code sessions when the user wants minimal fluff and efficient token usage.
---

# Caveman Skill

Use this skill when the user wants compact, practical Claude Code output.

## Behavior

- Be direct and concise.
- Prefer actions, diffs, commands, and verified findings over commentary.
- Avoid praise, filler, repeated confirmations, and long conversational framing.
- Ask only blocking questions.
- For multi-step work, give a short plan, execute, then summarize what changed.
- Keep explanations proportional to risk and complexity.
- Do not hide uncertainty. State what was verified and what was not.
- Preserve correctness over brevity.

## Output Pattern

1. State the actionable result.
2. List changed files or commands only when useful.
3. Mention remaining risks or manual checks.
4. Give one next step at most.
`
  },
  {
    id: "context-compaction",
    name: "Context Compaction",
    description: "A workflow for keeping Claude Code context lean with /compact during long sessions.",
    folderName: "context-compaction",
    fileName: "SKILL.md",
    content: `---
name: context-compaction
description: Trigger /compact at practical checkpoints to keep long Claude Code sessions token-efficient.
---

# Context Compaction Skill

Use this skill in long sessions where context has become noisy.

## Behavior

- Before broad refactors or parallel tasks, run /compact.
- Keep a minimal summary of current goals and blockers before compaction.
- Resume with concise state: objective, touched files, and next step.
- Do not compact in the middle of an unresolved critical edit.
`
  },
  {
    id: "plan-mode",
    name: "Plan Mode",
    description: "A strategy-first execution pattern for complex implementation tasks.",
    folderName: "plan-mode",
    fileName: "SKILL.md",
    content: `---
name: plan-mode
description: Use explicit planning before execution for complex tasks with architectural constraints.
---

# Plan Mode Skill

Use this skill when tasks include multiple phases or non-trivial risk.

## Behavior

- Start with a short numbered plan.
- Mark dependencies and identify the critical path.
- Execute one step at a time and update plan state as work progresses.
- Keep implementation aligned with existing project conventions.
- End with a concise summary of delivered scope and follow-ups.
`
  },
  {
    id: "dynamic-model-selection",
    name: "Dynamic Model Selection",
    description: "Guidance for mapping DeepSeek Pro/Flash roles in Claude Code token-max workflows.",
    folderName: "dynamic-model-selection",
    fileName: "SKILL.md",
    content: `---
name: dynamic-model-selection
description: Map heavy reasoning to DeepSeek Pro and quick subprocess work to DeepSeek Flash.
---

# Dynamic Model Selection Skill

Use this skill to keep cost and latency balanced in Claude Code.

## Behavior

- Route architecture and complex reasoning to deepseek-v4-pro.
- Route frequent terminal checks, read-heavy subtasks, and iterative edits to deepseek-v4-flash.
- Keep the model mapping consistent with environment exports in launch scripts.
- Prefer Flash for subagents unless quality issues require Pro.
`
  }
];

fs.mkdirSync(CONFIG_DIR, { recursive: true });

function readFileSafe(file, fallback = "") {
  try { return fs.readFileSync(file, "utf8").trim(); }
  catch { return fallback; }
}

function hasKey() {
  return fs.existsSync(KEY_FILE) && readFileSafe(KEY_FILE).length > 0;
}

function expandHome(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  if (value === "~") return os.homedir();
  if (value.startsWith(`~${path.sep}`) || value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}

function getSkillsDir() {
  return expandHome(readFileSafe(SKILLS_DIR_FILE, DEFAULT_SKILLS_DIR)) || DEFAULT_SKILLS_DIR;
}

function getProjectDir() {
  return expandHome(readFileSafe(PROJECT_DIR_FILE, DEFAULT_PROJECT_DIR)) || DEFAULT_PROJECT_DIR;
}

function getTokenRulesPath(projectDir = getProjectDir()) {
  return path.join(projectDir, "CLAUDE.md");
}

function tokenRulesStatus() {
  const projectDir = getProjectDir();
  const targetPath = getTokenRulesPath(projectDir);
  let installed = false;
  let matchesBundled = false;

  try {
    const current = fs.readFileSync(targetPath, "utf8");
    installed = true;
    matchesBundled = current.trim() === TOKEN_EFFICIENT_CLAUDE_MD.trim();
  } catch {}

  return { projectDir, targetPath, installed, matchesBundled };
}

function getSkillPath(skill, skillsDir = getSkillsDir()) {
  return path.join(skillsDir, skill.folderName, skill.fileName);
}

function skillStatus(skill, skillsDir = getSkillsDir()) {
  const targetPath = getSkillPath(skill, skillsDir);
  let installed = false;
  let matchesBundled = false;

  try {
    const current = fs.readFileSync(targetPath, "utf8");
    installed = true;
    matchesBundled = current.trim() === skill.content.trim();
  } catch {}

  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    installed,
    matchesBundled,
    targetPath
  };
}

function allSkillStatuses() {
  const skillsDir = getSkillsDir();
  return {
    skillsDir,
    skills: BUNDLED_SKILLS.map((skill) => skillStatus(skill, skillsDir))
  };
}

function run(command, args = []) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 9000 }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stdout?.trim() || "",
        stderr: stderr?.trim() || "",
        error: error ? String(error.message || error) : ""
      });
    });
  });
}

function killPreviousClaudeSession() {
  const pidRaw = readFileSafe(PID_FILE, "");
  const pid = Number(pidRaw);

  if (!pid || Number.isNaN(pid)) return { killed: false, message: "No previous session is being tracked." };

  try {
    process.kill(pid, "SIGTERM");
    try { fs.unlinkSync(PID_FILE); } catch {}
    return { killed: true, message: `Previous session terminated, PID ${pid}.` };
  } catch (_error) {
    try { fs.unlinkSync(PID_FILE); } catch {}
    return { killed: false, message: `Previous PID is no longer active: ${pid}.` };
  }
}

function wrapClaudeCommand(exportsBlock) {
  const pidFile = PID_FILE.replace(/'/g, "'\\''");
  return `
${exportsBlock}
echo "CCDS: Claude session started. PID saved in ${pidFile}"
claude &
echo $! > '${pidFile}'
wait $!
rm -f '${pidFile}'
`.trim();
}

function terminalCommand(mode) {
  const key = readFileSafe(KEY_FILE);
  const esc = (s) => String(s).replace(/'/g, "'\\''");

  if (mode === "off") {
    return wrapClaudeCommand(`
unset ANTHROPIC_BASE_URL
unset ANTHROPIC_AUTH_TOKEN
unset ANTHROPIC_API_KEY
unset ANTHROPIC_MODEL
unset ANTHROPIC_DEFAULT_OPUS_MODEL
unset ANTHROPIC_DEFAULT_SONNET_MODEL
unset ANTHROPIC_DEFAULT_HAIKU_MODEL
unset CLAUDE_CODE_SUBAGENT_MODEL
unset CLAUDE_CODE_EFFORT_LEVEL
`.trim());
  }

  const model = mode === "pro" ? PRO_MODEL : FLASH_MODEL;
  const effort = mode === "pro" ? "max" : "medium";
  const sonnet = mode === "pro" ? PRO_MODEL : FLASH_MODEL;

  return wrapClaudeCommand(`
export ANTHROPIC_BASE_URL='${esc(BASE_URL)}'
export ANTHROPIC_AUTH_TOKEN='${esc(key)}'
unset ANTHROPIC_API_KEY
export ANTHROPIC_MODEL='${esc(model)}'
export ANTHROPIC_DEFAULT_OPUS_MODEL='${esc(PRO_MODEL)}'
export ANTHROPIC_DEFAULT_SONNET_MODEL='${esc(sonnet)}'
export ANTHROPIC_DEFAULT_HAIKU_MODEL='${esc(FLASH_MODEL)}'
export CLAUDE_CODE_SUBAGENT_MODEL='${esc(FLASH_MODEL)}'
export CLAUDE_CODE_EFFORT_LEVEL='${esc(effort)}'
`.trim());
}

function launchTerminal(command) {
  const platform = process.platform;

  if (platform === "darwin") {
    const appleScript = `
tell application "Terminal"
  activate
  do script ${JSON.stringify(command)}
end tell
`;
    spawn("osascript", ["-e", appleScript], { detached: true, stdio: "ignore" }).unref();
    return { ok: true, message: "Opened in Terminal.app" };
  }

  if (platform === "linux") {
    const candidates = [
      ["gnome-terminal", ["--", "bash", "-lc", command]],
      ["konsole", ["-e", "bash", "-lc", command]],
      ["xterm", ["-e", "bash", "-lc", command]]
    ];

    for (const [bin, args] of candidates) {
      try {
        const child = spawn(bin, args, { detached: true, stdio: "ignore" });
        child.unref();
        return { ok: true, message: `Opened with ${bin}` };
      } catch {}
    }
    return { ok: false, message: "No supported Linux terminal was found." };
  }

  if (platform === "win32") {
    spawn("cmd.exe", ["/c", "start", "cmd.exe", "/k", command], { detached: true, stdio: "ignore" }).unref();
    return { ok: true, message: "Opened in cmd.exe" };
  }

  return { ok: false, message: `Unsupported platform: ${platform}` };
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1120,
    height: 860,
    minWidth: 920,
    minHeight: 700,
    title: "Claude DeepSeek Switcher",
    backgroundColor: "#090b12",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("status", async () => {
  const claude = await run("claude", ["--version"]);
  const pidRaw = readFileSafe(PID_FILE, "");
  let sessionActive = false;
  if (pidRaw) {
    try {
      process.kill(Number(pidRaw), 0);
      sessionActive = true;
    } catch {
      sessionActive = false;
    }
  }

  return {
    claudeInstalled: claude.ok,
    claudeVersion: claude.stdout || claude.stderr || "",
    keyConfigured: hasKey(),
    mode: readFileSafe(MODE_FILE, "none"),
    activePid: pidRaw || "",
    sessionActive,
    configDir: CONFIG_DIR,
    baseUrl: BASE_URL,
    flashModel: FLASH_MODEL,
    proModel: PRO_MODEL,
    ...allSkillStatuses(),
    tokenRules: tokenRulesStatus()
  };
});

ipcMain.handle("save-key", async (_event, key) => {
  key = String(key || "").trim();
  if (!key) return { ok: false, message: "API key is empty." };

  fs.writeFileSync(KEY_FILE, key, { encoding: "utf8", mode: 0o600 });
  try { fs.chmodSync(KEY_FILE, 0o600); } catch {}
  return { ok: true, message: "DeepSeek API key saved." };
});

ipcMain.handle("save-skills-dir", async (_event, skillsDir) => {
  const expanded = expandHome(skillsDir);
  if (!expanded) return { ok: false, message: "Skills directory is empty." };
  fs.writeFileSync(SKILLS_DIR_FILE, expanded, "utf8");
  return { ok: true, message: "Skills directory saved.", skillsDir: expanded, ...allSkillStatuses() };
});

ipcMain.handle("save-project-dir", async (_event, projectDir) => {
  const expanded = expandHome(projectDir);
  if (!expanded) return { ok: false, message: "Project directory is empty." };
  fs.writeFileSync(PROJECT_DIR_FILE, expanded, "utf8");
  return { ok: true, message: "Project directory saved.", tokenRules: tokenRulesStatus() };
});

function installSkillById(skillId) {
  const skill = BUNDLED_SKILLS.find((item) => item.id === skillId);
  if (!skill) throw new Error("Unknown skill.");

  const skillsDir = getSkillsDir();
  const skillDir = path.join(skillsDir, skill.folderName);
  const targetPath = getSkillPath(skill, skillsDir);

  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(targetPath, skill.content, "utf8");
  return skillStatus(skill, skillsDir);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function installTokenRules() {
  const projectDir = getProjectDir();
  const targetPath = getTokenRulesPath(projectDir);
  let backupPath = "";

  fs.mkdirSync(projectDir, { recursive: true });

  if (fs.existsSync(targetPath)) {
    const current = fs.readFileSync(targetPath, "utf8");
    if (current.trim() !== TOKEN_EFFICIENT_CLAUDE_MD.trim()) {
      backupPath = `${targetPath}.backup-${timestamp()}`;
      fs.writeFileSync(backupPath, current, "utf8");
    }
  }

  fs.writeFileSync(targetPath, TOKEN_EFFICIENT_CLAUDE_MD, "utf8");
  return { ...tokenRulesStatus(), backupPath };
}

ipcMain.handle("install-skill", async (_event, skillId) => {
  try {
    const skill = BUNDLED_SKILLS.find((item) => item.id === skillId);
    const installedSkill = installSkillById(skillId);

    return {
      ok: true,
      message: `${skill.name} skill installed at ${installedSkill.targetPath}`,
      skill: installedSkill,
      ...allSkillStatuses()
    };
  } catch (error) {
    return { ok: false, message: `Skill install failed: ${error.message || error}` };
  }
});

ipcMain.handle("install-token-rules", async () => {
  try {
    const tokenRules = installTokenRules();
    return { ok: true, message: `Token-efficient CLAUDE.md installed at ${tokenRules.targetPath}${tokenRules.backupPath ? `\nBackup created: ${tokenRules.backupPath}` : ""}`, tokenRules };
  } catch (error) {
    return { ok: false, message: `Token rules install failed: ${error.message || error}` };
  }
});

ipcMain.handle("install-token-max", async () => {
  try {
    const skills = BUNDLED_SKILLS.map((skill) => installSkillById(skill.id));
    const tokenRules = installTokenRules();
    return {
      ok: true,
      message: `Token-max setup installed: ${skills.length} skill(s) plus ${tokenRules.targetPath}${tokenRules.backupPath ? `\nBackup created: ${tokenRules.backupPath}` : ""}`,
      ...allSkillStatuses(),
      tokenRules
    };
  } catch (error) {
    return { ok: false, message: `Token-max setup failed: ${error.message || error}` };
  }
});

ipcMain.handle("launch", async (_event, mode) => {
  if (!["flash", "pro", "off"].includes(mode)) return { ok: false, message: "Invalid mode." };
  if (mode !== "off" && !hasKey()) return { ok: false, message: "Configure the DeepSeek API key first." };

  const killed = killPreviousClaudeSession();
  fs.writeFileSync(MODE_FILE, mode, "utf8");
  const launched = launchTerminal(terminalCommand(mode));
  return {
    ...launched,
    killedPrevious: killed.killed,
    killMessage: killed.message
  };
});

ipcMain.handle("stop-session", async () => {
  const killed = killPreviousClaudeSession();
  return { ok: true, ...killed };
});

ipcMain.handle("copy-command", async (_event, mode) => {
  if (!["flash", "pro", "off"].includes(mode)) return { ok: false, message: "Invalid mode." };
  if (mode !== "off" && !hasKey()) return { ok: false, message: "Configure the DeepSeek API key first." };

  return { ok: true, command: terminalCommand(mode) };
});

ipcMain.handle("install-claude", async () => {
  const npm = await run("npm", ["--version"]);
  if (!npm.ok) return { ok: false, output: "npm was not found. Install Node.js first." };

  return new Promise((resolve) => {
    const child = spawn("npm", ["install", "-g", "@anthropic-ai/claude-code"], { stdio: "pipe" });
    let output = "";
    child.stdout.on("data", (d) => output += d.toString());
    child.stderr.on("data", (d) => output += d.toString());
    child.on("close", (code) => resolve({ ok: code === 0, code, output }));
  });
});
