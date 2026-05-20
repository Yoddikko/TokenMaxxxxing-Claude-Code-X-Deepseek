const { contextBridge, ipcRenderer, clipboard } = require("electron");

contextBridge.exposeInMainWorld("ccds", {
  status: () => ipcRenderer.invoke("status"),
  saveKey: (key) => ipcRenderer.invoke("save-key", key),
  saveSkillsDir: (skillsDir) => ipcRenderer.invoke("save-skills-dir", skillsDir),
  saveProjectDir: (projectDir) => ipcRenderer.invoke("save-project-dir", projectDir),
  installSkill: (skillId) => ipcRenderer.invoke("install-skill", skillId),
  installTokenRules: () => ipcRenderer.invoke("install-token-rules"),
  installTokenMax: () => ipcRenderer.invoke("install-token-max"),
  launch: (mode) => ipcRenderer.invoke("launch", mode),
  installClaude: () => ipcRenderer.invoke("install-claude"),
  stopSession: () => ipcRenderer.invoke("stop-session"),
  copyCommand: async (mode) => {
    const res = await ipcRenderer.invoke("copy-command", mode);
    if (res.ok && res.command) clipboard.writeText(res.command);
    return res;
  }
});
