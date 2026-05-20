# Claude DeepSeek Desktop

Electron desktop app. It does not use localhost and does not open web pages in your browser.

## Start

```bash
unzip claude_deepseek_desktop_switch.zip
cd claude_deepseek_desktop_switch
npm install
npm start
```

## What it does

- Provides a real desktop UI with no localhost server.
- Checks whether `claude` is installed.
- Saves the DeepSeek API key locally in `~/.ccds-desktop/deepseek.key`.
- Opens Terminal with Claude Code configured for:
  - DeepSeek Flash
  - DeepSeek Pro[1m]
  - normal Claude without DeepSeek routing
- Installs bundled Claude Code Skills from the UI.
- Installs a project-level `CLAUDE.md` token-efficiency file from `drona23/claude-token-efficient`, with an extra section telling Claude Code to use the bundled Skills for compact execution-focused work.
- Shows install state with traffic-light states:
  - red: not installed
  - yellow: installing
  - green: installed

## One-click token-max setup

Use **Install full token-max setup** to install both pieces:

1. Bundled Skills into your configured Skills directory.
2. Token-efficient `CLAUDE.md` into your configured target project directory.

The bundled `CLAUDE.md` keeps the upstream lean rules and adds a short local section:

- prefer installed Claude Code Skills for compact execution-focused work
- use the Caveman skill when terse status updates and minimal framing are useful
- keep responses short unless the user explicitly asks for detail
- do not trade correctness, verification, or safety for brevity

## Skills installer

The app includes a bundled **Caveman** skill and writes it as `SKILL.md` inside the configured Skills directory.

Default path:

```bash
~/.claude/skills/caveman/SKILL.md
```

You can change the Skills directory in the app before installing. This is useful if your Claude Code setup uses a different custom skills path.

## Token-efficient CLAUDE.md installer

The app lets you choose the target project directory, then writes:

```bash
/path/to/your/project/CLAUDE.md
```

The app shows whether that file is missing, installed, or different from the bundled version.

Source project:

```text
https://github.com/drona23/claude-token-efficient
```

## Flash / Pro switching

The Flash, Pro, and Normal buttons work as switch/restart actions:

- If the app started a previous Claude session, it stores the PID.
- When you click Flash, Pro, or Normal, it tries to terminate that tracked PID.
- It then opens a new Terminal window with the selected profile.

Limit: if you started Claude manually outside the app, the app does not know which process to close.

## Note

To open `claude`, the app still needs to open a Terminal window because Claude Code is a CLI.

It does not use OpenRouter.
