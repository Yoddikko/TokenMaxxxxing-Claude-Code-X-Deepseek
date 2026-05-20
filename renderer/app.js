const $ = (id) => document.getElementById(id);
const log = $("log");
const installingSkills = new Set();
let latestSkills = [];
let tokenRulesInstalling = false;

function writeLog(text) {
  log.textContent = text;
}

function setDot(el, state) {
  el.className = `dot ${state}`;
}

function skillDotState(skill) {
  if (installingSkills.has(skill.id)) return "loading";
  return skill.installed ? "ok" : "bad";
}

function tokenRulesDotState(tokenRules) {
  if (tokenRulesInstalling) return "loading";
  return tokenRules?.installed ? "ok" : "bad";
}

function renderTokenRules(tokenRules) {
  const dot = $("tokenRulesDot");
  if (!dot) return;

  setDot(dot, tokenRulesDotState(tokenRules));
  $("projectDir").value = tokenRules?.projectDir || "";
  $("tokenRulesText").textContent = tokenRules?.installed
    ? (tokenRules.matchesBundled ? "Installed and current" : "Installed, but differs from the bundled token-max version")
    : "Not installed";
  $("tokenRulesPath").textContent = tokenRules?.targetPath || "";
  $("installTokenRulesBtn").textContent = tokenRules?.installed ? "Reinstall CLAUDE.md" : "Install CLAUDE.md";
}

function renderSkills(skills) {
  latestSkills = skills || [];
  const list = $("skillsList");
  list.innerHTML = "";

  if (!latestSkills.length) {
    list.innerHTML = `<p class="hint">No bundled skills are available.</p>`;
    return;
  }

  for (const skill of latestSkills) {
    const row = document.createElement("div");
    row.className = "skill-row";
    row.innerHTML = `
      <span id="skillDot-${skill.id}" class="dot ${skillDotState(skill)}"></span>
      <div class="skill-copy">
        <strong>${skill.name}</strong>
        <p>${skill.description}</p>
        <p class="path">${skill.targetPath}</p>
      </div>
      <button class="secondary install-skill" data-skill-id="${skill.id}">${skill.installed ? "Reinstall" : "Install"}</button>
    `;
    list.appendChild(row);
  }

  document.querySelectorAll(".install-skill").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const skillId = btn.dataset.skillId;
      installingSkills.add(skillId);
      btn.disabled = true;
      renderSkills(latestSkills);
      writeLog(`Installing ${skillId} skill...`);

      const res = await window.ccds.installSkill(skillId);
      writeLog(res.message || (res.ok ? "Skill installed." : "Skill install failed."));
      installingSkills.delete(skillId);
      await refreshStatus();
    });
  });
}

async function refreshStatus() {
  const s = await window.ccds.status();

  setDot($("claudeDot"), s.claudeInstalled ? "ok" : "bad");
  $("claudeText").textContent = s.claudeInstalled
    ? `Installed ${s.claudeVersion || ""}`
    : "Not found. You can install it with the button below.";

  setDot($("keyDot"), s.keyConfigured ? "ok" : "bad");
  $("keyText").textContent = s.keyConfigured ? "Configured" : "Not configured";

  $("modeText").textContent = s.mode;
  $("sessionText").textContent = s.sessionActive ? `Active session, PID ${s.activePid}` : "Tracked session: none";
  $("baseUrl").textContent = s.baseUrl;
  $("flashModel").textContent = s.flashModel;
  $("proModel").textContent = s.proModel;
  $("skillsDir").value = s.skillsDir || "";
  renderSkills(s.skills || []);
  renderTokenRules(s.tokenRules);
}

$("refreshBtn").addEventListener("click", refreshStatus);

$("saveKeyBtn").addEventListener("click", async () => {
  const key = $("apiKey").value.trim();
  const res = await window.ccds.saveKey(key);
  if (res.ok) $("apiKey").value = "";
  writeLog(res.message);
  await refreshStatus();
});

$("saveSkillsDirBtn").addEventListener("click", async () => {
  const skillsDir = $("skillsDir").value.trim();
  const res = await window.ccds.saveSkillsDir(skillsDir);
  writeLog(res.message);
  await refreshStatus();
});

$("saveProjectDirBtn").addEventListener("click", async () => {
  const projectDir = $("projectDir").value.trim();
  const res = await window.ccds.saveProjectDir(projectDir);
  writeLog(res.message);
  await refreshStatus();
});

$("installTokenRulesBtn").addEventListener("click", async () => {
  tokenRulesInstalling = true;
  renderTokenRules({ projectDir: $("projectDir").value.trim(), targetPath: $("tokenRulesPath").textContent, installed: false });
  writeLog("Installing token-efficient CLAUDE.md...");
  const res = await window.ccds.installTokenRules();
  writeLog(res.message);
  tokenRulesInstalling = false;
  await refreshStatus();
});

$("installTokenMaxBtn").addEventListener("click", async () => {
  tokenRulesInstalling = true;
  for (const skill of latestSkills) installingSkills.add(skill.id);
  renderSkills(latestSkills);
  renderTokenRules({ projectDir: $("projectDir").value.trim(), targetPath: $("tokenRulesPath").textContent, installed: false });
  writeLog("Installing token-max setup...");
  const res = await window.ccds.installTokenMax();
  writeLog(res.message);
  tokenRulesInstalling = false;
  installingSkills.clear();
  await refreshStatus();
});

document.querySelectorAll(".launch").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const mode = btn.dataset.mode;
    btn.disabled = true;
    writeLog(`Starting ${mode} mode...`);
    const res = await window.ccds.launch(mode);
    writeLog(`${res.killMessage || ""}\n${res.message || (res.ok ? "Started." : "Error.")}`.trim());
    await refreshStatus();
    btn.disabled = false;
  });
});

$("installClaudeBtn").addEventListener("click", async () => {
  const ok = confirm("Install Claude Code globally with npm?");
  if (!ok) return;

  $("installClaudeBtn").disabled = true;
  writeLog("Installing Claude Code...");
  const res = await window.ccds.installClaude();
  writeLog(res.output || (res.ok ? "Installed." : "Install failed."));
  await refreshStatus();
  $("installClaudeBtn").disabled = false;
});

async function copy(mode) {
  const res = await window.ccds.copyCommand(mode);
  writeLog(res.ok ? `${mode} command copied to clipboard.` : res.message);
}

$("copyFlashBtn").addEventListener("click", () => copy("flash"));
$("copyProBtn").addEventListener("click", () => copy("pro"));
$("copyOffBtn").addEventListener("click", () => copy("off"));

$("stopSessionBtn").addEventListener("click", async () => {
  const res = await window.ccds.stopSession();
  writeLog(res.message || "Session stopped.");
  await refreshStatus();
});

refreshStatus().catch((e) => writeLog(e.message));
