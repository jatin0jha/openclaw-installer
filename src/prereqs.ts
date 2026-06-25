import * as p from "@clack/prompts";
import { execa } from "execa";
import type { PlatformInfo } from "./platform.js";

async function commandExists(cmd: string): Promise<boolean> {
  try {
    const which = process.platform === "win32" ? "where" : "which";
    await execa(which, [cmd]);
    return true;
  } catch {
    return false;
  }
}

async function getNodeVersion(): Promise<string | null> {
  try {
    const { stdout } = await execa("node", ["-v"]);
    return stdout.trim().replace(/^v/, "");
  } catch {
    return null;
  }
}

function semverMajor(version: string): number {
  const [major] = version.split(".");
  return parseInt(major, 10);
}

async function installWithConfirm(
  label: string,
  command: string,
  args: string[],
  info: PlatformInfo,
): Promise<boolean> {
  const shouldInstall = await p.confirm({
    message: `${label} is not installed. Install it now?`,
  });
  if (p.isCancel(shouldInstall) || !shouldInstall) {
    p.log.warn(`Skipping ${label} installation.`);
    return false;
  }

  const s = p.spinner();
  s.start(`Installing ${label}...`);
  try {
    if (info.platform === "win32") {
      await execa("powershell", ["-Command", [command, ...args].join(" ")], {
        stdio: "pipe",
      });
    } else {
      await execa(command, args, { stdio: "pipe", shell: true });
    }
    s.stop(`${label} installed successfully.`);
    return true;
  } catch (err) {
    s.stop(`Failed to install ${label}.`);
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(msg);
    return false;
  }
}

export async function checkPrerequisites(info: PlatformInfo): Promise<void> {
  p.log.step("Checking prerequisites...");

  // --- Node.js ---
  const nodeVersion = await getNodeVersion();
  if (!nodeVersion) {
    p.log.error(
      "Node.js is not installed. OpenClaw requires Node.js 22 or later.",
    );
    p.log.info(
      "This prereq step only checks Node. Node install/upgrade is handled in the next step by the official OpenClaw installer.",
    );
  } else {
    const major = semverMajor(nodeVersion);
    if (major < 22) {
      p.log.warn(
        `Node.js ${nodeVersion} detected. OpenClaw requires Node 22+. This step will continue, and the official OpenClaw installer will try to upgrade Node in the installation phase.`,
      );
    } else {
      p.log.success(`Node.js ${nodeVersion} — OK`);
    }
  }

  // --- Git ---
  const hasGit = await commandExists("git");
  if (hasGit) {
    p.log.success("git — OK");
  } else {
    if (info.platform === "darwin") {
      await installWithConfirm(
        "git (via Xcode CLT)",
        "xcode-select",
        ["--install"],
        info,
      );
    } else if (info.platform === "linux") {
      const cmd =
        info.distroFamily === "debian"
          ? "sudo apt-get install -y git"
          : info.distroFamily === "rhel"
            ? "sudo dnf install -y git"
            : "sudo apt-get install -y git";
      await installWithConfirm("git", cmd, [], info);
    } else {
      p.log.warn(
        "git is not installed. Please install Git for Windows: https://git-scm.com/download/win",
      );
    }
  }

  // --- Homebrew (macOS only) ---
  if (info.platform === "darwin") {
    const hasBrew = await commandExists("brew");
    if (hasBrew) {
      p.log.success("Homebrew — OK");
    } else {
      await installWithConfirm(
        "Homebrew",
        '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
        [],
        info,
      );
    }
  }

  // --- libsecret (Linux only, for keytar) ---
  if (info.platform === "linux" && info.distroFamily === "debian") {
    try {
      await execa("dpkg", ["-s", "libsecret-1-dev"], { stdio: "pipe" });
      p.log.success("libsecret-1-dev — OK");
    } catch {
      const s = p.spinner();
      s.start("Installing libsecret-1-dev (needed for OS keychain)...");
      try {
        await execa("sudo", ["apt-get", "install", "-y", "libsecret-1-dev"], {
          stdio: "inherit",
        });
        s.stop("libsecret-1-dev installed.");
      } catch {
        s.stop("Could not install libsecret-1-dev.");
        p.log.warn(
          "OS keychain may not work. Secrets will fall back to file-based storage.",
        );
      }
    }
  }

  // --- keytar (OS keychain support) ---
  await ensureKeytar();
}

async function isKeytarAvailable(): Promise<boolean> {
  try {
    await import("keytar");
    return true;
  } catch {
    return false;
  }
}

async function ensureKeytar(): Promise<void> {
  if (await isKeytarAvailable()) {
    p.log.success("OS keychain (keytar) — OK");
    return;
  }

  const s = p.spinner();
  s.start("Installing OS keychain support (keytar)...");
  try {
    await execa("npm", ["install", "-g", "keytar"], { stdio: "pipe" });
    s.stop("OS keychain support (keytar) installed.");
  } catch {
    s.stop("Could not install keytar via npm.");
    p.log.warn(
      "OS keychain unavailable. Secrets will be stored in ~/.openclaw/.env (chmod 600) instead.",
    );
  }
}
