# OpenClaw Secure Installer

Cross-platform CLI that installs [OpenClaw](https://openclaw.ai) with all dependencies and applies security hardening out of the box.

## Quick install

**macOS / Linux:**

```bash
curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/openclaw-installer/main/scripts/install.sh | bash
```

**Windows (PowerShell):**

```powershell
iwr -useb https://raw.githubusercontent.com/YOUR_ORG/openclaw-installer/main/scripts/install.ps1 | iex
```

## What it does

1. **Detects your platform** — macOS (arm64/x64), Linux (Debian/RHEL), Windows
2. **Checks prerequisites** — Node.js 22+, git, Homebrew (macOS), libsecret (Linux)
3. **Runs the official OpenClaw installer** — delegates to `install.sh` / `install.ps1`
4. **API key wizard** — choose Anthropic, OpenAI, or Ollama; key is stored in your OS keychain (falls back to `~/.openclaw/.env` with `chmod 600`)
5. **Channel setup** — Telegram, Discord, WhatsApp — prompts for tokens and writes config
6. **Security hardening:**
   - Gateway bound to loopback only with token auth
   - Exec policy set to `deny` / `ask: always`
   - DM policy set to `pairing`
   - File permissions locked to `600`
   - Auto-generated gateway auth token
   - Optional firewall rules (ufw / pf / netsh)
   - Runs `openclaw security audit --deep` and offers auto-fix

## CLI options

```
openclaw-install [options]

  --skip-security   Skip all Phase 4 security steps
  --no-prompt       Non-interactive mode (skips channels, firewall)
  --yes             Alias for --no-prompt
  --help, -h        Show help
```

## Development

```bash
npm install
npm run build       # one-time build
npm run dev         # watch mode
node bin/index.js   # run locally
```

## Releasing

Push a version tag to trigger the GitHub Actions release pipeline:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This builds standalone binaries for all 4 platforms (darwin-arm64, darwin-x64, linux-x64, win32-x64) and uploads them to a GitHub Release.

## Project structure

```
├── bin/index.js          Thin entry point
├── src/
│   ├── index.ts          CLI orchestration, arg parsing
│   ├── platform.ts       OS/arch detection
│   ├── prereqs.ts        Prerequisite checks + install prompts
│   ├── install.ts        Official OpenClaw installer wrapper
│   ├── api-key.ts        API key provider selection + validation
│   ├── keychain.ts       OS keychain (keytar) with .env fallback
│   ├── channels.ts       Channel multi-select wizard
│   ├── security.ts       Config hardening, firewall, audit
│   └── config.ts         OpenClaw config read/write (JSON5)
├── scripts/
│   ├── install.sh        One-liner for macOS/Linux
│   └── install.ps1       One-liner for Windows
└── .github/workflows/
    └── release.yml       CI: build + publish binaries
```

## License

MIT
