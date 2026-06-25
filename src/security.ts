import * as p from "@clack/prompts";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execa } from "execa";
import { patchConfig, getConfigDir } from "./config.js";
import type { PlatformInfo } from "./platform.js";

export async function applySecureDefaults(): Promise<void> {
  p.log.step("Applying secure configuration defaults...");

  await patchConfig((cfg) => {
    // Gateway: local-only, loopback, token auth
    cfg.gateway = cfg.gateway ?? {};
    cfg.gateway.mode = "local";
    cfg.gateway.bind = "loopback";
    cfg.gateway.auth = cfg.gateway.auth ?? {};
    cfg.gateway.auth.mode = "token";

    // Tools: deny exec by default, always ask
    cfg.tools = cfg.tools ?? {};
    cfg.tools.exec = cfg.tools.exec ?? {};
    cfg.tools.exec.security = "deny";
    cfg.tools.exec.ask = "always";
    cfg.tools.elevated = cfg.tools.elevated ?? {};
    cfg.tools.elevated.enabled = false;

    // Session: per-channel-peer DM scope
    cfg.session = cfg.session ?? {};
    cfg.session.dmScope = "per-channel-peer";

    // Channels: set dmPolicy to pairing if not already configured
    if (cfg.channels) {
      for (const [, channelCfg] of Object.entries(cfg.channels)) {
        const ch = channelCfg as Record<string, unknown>;
        if (!ch.dmPolicy) {
          ch.dmPolicy = "pairing";
        }
      }
    }

    return cfg;
  });

  p.log.success("Secure defaults applied: gateway=local, exec=deny, dmPolicy=pairing.");
}

export async function generateGatewayToken(): Promise<string> {
  p.log.step("Generating gateway authentication token...");

  const token = crypto.randomBytes(32).toString("hex");

  await patchConfig((cfg) => {
    cfg.gateway = cfg.gateway ?? {};
    cfg.gateway.auth = cfg.gateway.auth ?? {};
    cfg.gateway.auth.mode = "token";
    cfg.gateway.auth.token = token;
    return cfg;
  });

  const tokenFile = path.join(getConfigDir(), "gateway-token.txt");
  await fs.writeFile(tokenFile, token + "\n", { mode: 0o600 });

  p.log.success(`Gateway token generated and saved to ${tokenFile}`);
  return token;
}

export async function setFilePermissions(): Promise<void> {
  if (process.platform === "win32") {
    p.log.info("Skipping chmod on Windows (NTFS permissions apply).");
    return;
  }

  const configDir = getConfigDir();
  try {
    const entries = await fs.readdir(configDir);
    for (const entry of entries) {
      const full = path.join(configDir, entry);
      const stat = await fs.stat(full);
      if (stat.isFile()) {
        await fs.chmod(full, 0o600);
      }
    }
    p.log.success(`File permissions set to 600 on all files in ${configDir}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.warn(`Could not set file permissions: ${msg}`);
  }
}

export async function setupFirewall(info: PlatformInfo): Promise<void> {
  const shouldSetup = await p.confirm({
    message:
      "Apply firewall rules to block external access to the OpenClaw gateway port? (recommended)",
    initialValue: false,
  });
  if (p.isCancel(shouldSetup) || !shouldSetup) {
    p.log.info("Skipping firewall configuration.");
    return;
  }

  const gatewayPort = 3377;

  const needsSudo = info.platform === "linux" || info.platform === "darwin";
  if (needsSudo) {
    p.log.info("Firewall rules require administrator access. You may be prompted for your password.");
  }

  try {
    if (info.platform === "linux") {
      const hasUfw = await execa("which", ["ufw"])
        .then(() => true)
        .catch(() => false);
      if (hasUfw) {
        await execa("sudo", [
          "ufw", "deny", "from", "any", "to", "any",
          "port", String(gatewayPort), "proto", "tcp",
        ], { stdio: "inherit" });
        await execa("sudo", [
          "ufw", "allow", "from", "127.0.0.1", "to", "any",
          "port", String(gatewayPort), "proto", "tcp",
        ], { stdio: "inherit" });
        p.log.success(`ufw rules applied for port ${gatewayPort}.`);
      } else {
        p.log.warn(
          "ufw not found. Install it (`sudo apt install ufw`) and re-run for firewall hardening.",
        );
      }
    } else if (info.platform === "darwin") {
      const pfRule = `block drop in proto tcp from any to any port ${gatewayPort}\npass in proto tcp from 127.0.0.1 to any port ${gatewayPort}\n`;
      const anchorFile = "/etc/pf.anchors/openclaw";
      const tmpFile = path.join(os.tmpdir(), "openclaw-pf-anchor");
      await fs.writeFile(tmpFile, pfRule);
      await execa("sudo", ["cp", tmpFile, anchorFile], { stdio: "inherit" });
      await execa("sudo", ["pfctl", "-a", "openclaw", "-f", anchorFile], { stdio: "inherit" });
      p.log.success(`pf anchor applied for port ${gatewayPort}.`);
      p.log.info(`Rule written to ${anchorFile}. Remove it to revert.`);
    } else if (info.platform === "win32") {
      const s = p.spinner();
      s.start("Applying Windows Firewall rules...");
      await execa("powershell", [
        "-Command",
        `netsh advfirewall firewall add rule name="OpenClaw Block" dir=in action=block protocol=tcp localport=${gatewayPort}`,
      ]);
      await execa("powershell", [
        "-Command",
        `netsh advfirewall firewall add rule name="OpenClaw Allow Localhost" dir=in action=allow protocol=tcp localport=${gatewayPort} remoteip=127.0.0.1`,
      ]);
      s.stop(`Windows Firewall rules applied for port ${gatewayPort}.`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    p.log.warn(`Firewall error: ${msg}`);
    p.log.info("You can apply firewall rules manually later.");
  }
}

interface AuditItem {
  name: string;
  passed: boolean;
  detail: string;
}

function parseAuditOutput(output: string): AuditItem[] {
  const items: AuditItem[] = [];
  const lines = output.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("✓") || trimmed.startsWith("✅") || trimmed.toLowerCase().includes("pass")) {
      items.push({
        name: trimmed.replace(/^[✓✅]\s*/, ""),
        passed: true,
        detail: trimmed,
      });
    } else if (
      trimmed.startsWith("✗") ||
      trimmed.startsWith("❌") ||
      trimmed.toLowerCase().includes("fail") ||
      trimmed.toLowerCase().includes("critical") ||
      trimmed.toLowerCase().includes("warn")
    ) {
      items.push({
        name: trimmed.replace(/^[✗❌]\s*/, ""),
        passed: false,
        detail: trimmed,
      });
    }
  }
  return items;
}

export async function runSecurityAudit(): Promise<boolean> {
  p.log.step("Running OpenClaw security audit...");

  const s = p.spinner();
  s.start("openclaw security audit --deep");

  try {
    const { stdout, stderr } = await execa("openclaw", [
      "security",
      "audit",
      "--deep",
    ]);
    s.stop("Security audit complete.");

    const output = stdout + "\n" + stderr;
    const items = parseAuditOutput(output);

    if (items.length === 0) {
      p.log.info("Audit output:");
      p.log.message(stdout || "(no output)");
      return true;
    }

    let hasCritical = false;
    for (const item of items) {
      if (item.passed) {
        p.log.success(item.name);
      } else {
        p.log.error(item.name);
        hasCritical = true;
      }
    }

    if (hasCritical) {
      const autoFix = await p.confirm({
        message:
          "Critical issues found. Attempt automatic fix? (openclaw security audit --deep --fix)",
      });
      if (!p.isCancel(autoFix) && autoFix) {
        const fixSpinner = p.spinner();
        fixSpinner.start("Applying automatic fixes...");
        try {
          await execa("openclaw", ["security", "audit", "--deep", "--fix"]);
          fixSpinner.stop("Automatic fixes applied.");
        } catch {
          fixSpinner.stop("Some fixes could not be applied.");
        }
      }
    }

    return !hasCritical;
  } catch (err) {
    s.stop("Security audit failed to run.");
    const msg = err instanceof Error ? err.message : String(err);
    p.log.warn(`Could not run security audit: ${msg}`);
    p.log.info(
      "You can run it manually later: openclaw security audit --deep",
    );
    return true;
  }
}
