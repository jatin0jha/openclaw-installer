import * as p from "@clack/prompts";
import { execa } from "execa";
import type { PlatformInfo } from "./platform.js";

export async function runOpenClawInstaller(
  info: PlatformInfo,
): Promise<void> {
  p.log.step("Installing OpenClaw...");

  const s = p.spinner();
  s.start("Running official OpenClaw installer (this may take a minute)...");

  try {
    if (info.platform === "win32") {
      await execa(
        "powershell",
        [
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          '& ([scriptblock]::Create((iwr -useb https://openclaw.ai/install.ps1))) -NoOnboard',
        ],
        { stdio: "inherit" },
      );
    } else {
      await execa(
        "bash",
        [
          "-c",
          "curl -fsSL --proto '=https' --tlsv1.2 https://openclaw.ai/install.sh | bash -s -- --no-onboard --no-prompt",
        ],
        { stdio: "inherit" },
      );
    }
    s.stop("OpenClaw installer completed.");
  } catch (err) {
    s.stop("OpenClaw installer encountered an error.");
    const msg = err instanceof Error ? err.message : String(err);
    p.log.error(`Installer error: ${msg}`);
    throw new Error("OpenClaw installation failed. Please check the output above.");
  }
}

export async function verifyInstallation(): Promise<string> {
  const s = p.spinner();
  s.start("Verifying OpenClaw installation...");

  try {
    const { stdout } = await execa("openclaw", ["--version"]);
    const version = stdout.trim();
    s.stop(`OpenClaw ${version} installed successfully.`);
    return version;
  } catch {
    s.stop("Verification failed.");
    throw new Error(
      "Could not run 'openclaw --version'. Make sure OpenClaw is in your PATH. " +
        "Try opening a new terminal and running this installer again.",
    );
  }
}
