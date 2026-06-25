import os from "node:os";
import fs from "node:fs/promises";

export type Platform = "darwin" | "linux" | "win32";
export type Arch = "arm64" | "x64";
export type LinuxDistroFamily = "debian" | "rhel" | "unknown";

export interface PlatformInfo {
  platform: Platform;
  arch: Arch;
  distroFamily: LinuxDistroFamily;
  distroName: string;
  prettyName: string;
}

const SUPPORTED_PLATFORMS: Platform[] = ["darwin", "linux", "win32"];
const SUPPORTED_ARCHS: Arch[] = ["arm64", "x64"];

async function detectLinuxDistro(): Promise<{
  family: LinuxDistroFamily;
  name: string;
}> {
  try {
    const content = await fs.readFile("/etc/os-release", "utf-8");
    const lines = content.split("\n");
    const kvs: Record<string, string> = {};
    for (const line of lines) {
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      const val = line.slice(eq + 1).trim().replace(/^"|"$/g, "");
      kvs[key] = val;
    }

    const id = (kvs["ID"] ?? "").toLowerCase();
    const idLike = (kvs["ID_LIKE"] ?? "").toLowerCase();
    const name = kvs["PRETTY_NAME"] ?? kvs["NAME"] ?? id;

    if (
      id === "ubuntu" ||
      id === "debian" ||
      id === "pop" ||
      id === "mint" ||
      idLike.includes("debian") ||
      idLike.includes("ubuntu")
    ) {
      return { family: "debian", name };
    }
    if (
      id === "fedora" ||
      id === "rhel" ||
      id === "centos" ||
      id === "rocky" ||
      id === "alma" ||
      idLike.includes("rhel") ||
      idLike.includes("fedora")
    ) {
      return { family: "rhel", name };
    }
    return { family: "unknown", name };
  } catch {
    return { family: "unknown", name: "Linux" };
  }
}

export async function detectPlatform(): Promise<PlatformInfo> {
  const platform = process.platform as string;
  const arch = os.arch();

  if (!SUPPORTED_PLATFORMS.includes(platform as Platform)) {
    throw new Error(
      `Unsupported platform: ${platform}. Supported: ${SUPPORTED_PLATFORMS.join(", ")}`,
    );
  }
  if (!SUPPORTED_ARCHS.includes(arch as Arch)) {
    throw new Error(
      `Unsupported architecture: ${arch}. Supported: ${SUPPORTED_ARCHS.join(", ")}`,
    );
  }

  let distroFamily: LinuxDistroFamily = "unknown";
  let distroName = "";
  if (platform === "linux") {
    const distro = await detectLinuxDistro();
    distroFamily = distro.family;
    distroName = distro.name;
  }

  const prettyNames: Record<string, string> = {
    darwin: `macOS (${arch})`,
    linux: `Linux${distroName ? ` – ${distroName}` : ""} (${arch})`,
    win32: `Windows (${arch})`,
  };

  return {
    platform: platform as Platform,
    arch: arch as Arch,
    distroFamily,
    distroName,
    prettyName: prettyNames[platform] ?? platform,
  };
}
