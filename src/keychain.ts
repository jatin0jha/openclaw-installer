import * as p from "@clack/prompts";
import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";

const SERVICE_NAME = "openclaw-installer";

export enum SecretStoreResult {
  Keychain = "keychain",
  File = "file",
}

async function tryKeytar(
  account: string,
  secret: string,
): Promise<boolean> {
  try {
    const keytarModule = await import("keytar");
    const keytar = (keytarModule.default ?? keytarModule) as {
      setPassword: (service: string, acc: string, pass: string) => Promise<void>;
    };
    await keytar.setPassword(SERVICE_NAME, account, secret);
    return true;
  } catch {
    return false;
  }
}

function getEnvFilePath(): string {
  return path.join(os.homedir(), ".openclaw", ".env");
}

async function writeToEnvFile(envKey: string, value: string): Promise<void> {
  const envPath = getEnvFilePath();
  const dir = path.dirname(envPath);
  await fs.mkdir(dir, { recursive: true });

  let content = "";
  try {
    content = await fs.readFile(envPath, "utf-8");
  } catch {
    // file does not exist yet
  }

  const regex = new RegExp(`^${envKey}=.*$`, "m");
  const line = `${envKey}=${value}`;
  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    content = content.trim() ? `${content.trim()}\n${line}\n` : `${line}\n`;
  }

  await fs.writeFile(envPath, content, { mode: 0o600 });
}

export async function storeSecret(
  account: string,
  envKey: string,
  secret: string,
): Promise<SecretStoreResult> {
  const stored = await tryKeytar(account, secret);
  if (stored) {
    return SecretStoreResult.Keychain;
  }

  p.log.warn(
    "OS keychain unavailable (keytar missing/unusable). Falling back to file-based storage.",
  );

  if (envKey) {
    await writeToEnvFile(envKey, secret);
    p.log.info(`Secret written to ${getEnvFilePath()} (chmod 600).`);
  }

  return SecretStoreResult.File;
}
