import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import JSON5 from "json5";
import { execa } from "execa";

export function getConfigDir(): string {
  return process.env.OPENCLAW_CONFIG_PATH
    ? path.dirname(process.env.OPENCLAW_CONFIG_PATH)
    : path.join(os.homedir(), ".openclaw");
}

export function getConfigPath(): string {
  return (
    process.env.OPENCLAW_CONFIG_PATH ??
    path.join(os.homedir(), ".openclaw", "openclaw.json")
  );
}

export async function resolveConfigPath(): Promise<string> {
  try {
    const { stdout } = await execa("openclaw", [
      "config",
      "path",
      "--absolute",
    ]);
    const resolved = stdout.trim();
    if (resolved) return resolved;
  } catch {
    // fall through to default
  }
  return getConfigPath();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readConfig(): Promise<Record<string, any>> {
  const cfgPath = await resolveConfigPath();
  try {
    const raw = await fs.readFile(cfgPath, "utf-8");
    return JSON5.parse(raw);
  } catch {
    return {};
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function writeConfig(cfg: Record<string, any>): Promise<void> {
  const cfgPath = await resolveConfigPath();
  await fs.mkdir(path.dirname(cfgPath), { recursive: true });
  await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2) + "\n", {
    mode: 0o600,
  });
}

export async function patchConfig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fn: (cfg: Record<string, any>) => Record<string, any>,
): Promise<void> {
  const cfg = await readConfig();
  const updated = fn(cfg);
  await writeConfig(updated);
}
