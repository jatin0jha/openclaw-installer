import * as p from "@clack/prompts";
import chalk from "chalk";
import { detectPlatform } from "./platform.js";
import { checkPrerequisites } from "./prereqs.js";
import { runOpenClawInstaller, verifyInstallation } from "./install.js";
import { setupApiKey } from "./api-key.js";
import { setupChannels } from "./channels.js";
import {
  applySecureDefaults,
  generateGatewayToken,
  setFilePermissions,
  setupFirewall,
  runSecurityAudit,
} from "./security.js";

const args = process.argv.slice(2);
const skipSecurity = args.includes("--skip-security");
const noPrompt = args.includes("--no-prompt") || args.includes("--yes");
const showHelp = args.includes("--help") || args.includes("-h");

if (showHelp) {
  console.log(`
${chalk.bold("openclaw-install")} — Cross-platform OpenClaw installer with security hardening

${chalk.dim("Usage:")}
  openclaw-install [options]

${chalk.dim("Options:")}
  --skip-security   Skip security hardening steps
  --no-prompt       Run non-interactively (skip channels & firewall)
  --yes             Alias for --no-prompt
  --help, -h        Show this help message
`);
  process.exit(0);
}

async function main() {
  p.intro(chalk.bgCyan(chalk.black(" OpenClaw Secure Installer ")));

  // --- Phase 2: Platform detection ---
  let info;
  try {
    info = await detectPlatform();
    p.log.success(`Detected platform: ${info.prettyName}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(msg);
    p.outro(chalk.red("Installation aborted."));
    process.exit(1);
  }

  // --- Phase 2: Prerequisites ---
  await checkPrerequisites(info);

  // --- Phase 3: Install OpenClaw ---
  try {
    await runOpenClawInstaller(info);
    await verifyInstallation();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(msg);
    p.outro(chalk.red("Installation failed."));
    process.exit(1);
  }

  // --- Phase 3: API Key ---
  if (!noPrompt) {
    const result = await setupApiKey();
    if (result) {
      p.log.success(`Provider: ${result.provider}`);
    }
  }

  // --- Phase 3: Channels ---
  if (!noPrompt) {
    await setupChannels();
  }

  // --- Phase 4: Security hardening ---
  if (!skipSecurity) {
    await applySecureDefaults();
    await generateGatewayToken();
    await setFilePermissions();

    if (!noPrompt) {
      await setupFirewall(info);
    }

    await runSecurityAudit();
  } else {
    p.log.info("Security hardening skipped (--skip-security).");
  }

  p.outro(
    chalk.green(
      "OpenClaw is installed and hardened! Run 'openclaw dashboard' to get started.",
    ),
  );
}

main().catch((err) => {
  console.error(chalk.red("Fatal error:"), err);
  process.exit(1);
});
