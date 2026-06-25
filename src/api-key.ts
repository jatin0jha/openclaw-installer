import * as p from "@clack/prompts";
import { storeSecret, SecretStoreResult } from "./keychain.js";
import { patchConfig } from "./config.js";

const PROVIDERS = [
  {
    value: "anthropic" as const,
    label: "Anthropic (Claude)",
    hint: "sk-ant-...",
    envKey: "ANTHROPIC_API_KEY",
    validate: (k: string) => k.startsWith("sk-ant-"),
  },
  {
    value: "openai" as const,
    label: "OpenAI (GPT)",
    hint: "sk-...",
    envKey: "OPENAI_API_KEY",
    validate: (k: string) => k.startsWith("sk-"),
  },
  {
    value: "ollama" as const,
    label: "Ollama (local)",
    hint: "No key needed",
    envKey: "",
    validate: () => true,
  },
] as const;

export type ProviderChoice = (typeof PROVIDERS)[number]["value"];

export interface ApiKeyResult {
  provider: ProviderChoice;
  key: string;
}

export async function setupApiKey(): Promise<ApiKeyResult | null> {
  const provider = await p.select({
    message: "Which AI provider will you use?",
    options: PROVIDERS.map((pr) => ({
      value: pr.value,
      label: pr.label,
      hint: pr.hint,
    })),
  });

  if (p.isCancel(provider)) return null;

  const chosen = PROVIDERS.find((pr) => pr.value === provider)!;

  if (provider === "ollama") {
    p.log.success("Ollama selected — no API key required.");
    return { provider: "ollama", key: "" };
  }

  const key = await p.password({
    message: `Enter your ${chosen.label} API key:`,
  });
  if (p.isCancel(key) || !key) return null;

  if (!chosen.validate(key)) {
    p.log.error(
      `Invalid key format. Expected key starting with "${chosen.hint.split("...")[0]}..."`,
    );
    const retry = await p.confirm({
      message: "Try entering the key again?",
    });
    if (p.isCancel(retry) || !retry) return null;
    return setupApiKey();
  }

  const result = await storeSecret(
    `openclaw-${provider}-api-key`,
    chosen.envKey,
    key,
  );

  if (result === SecretStoreResult.Keychain) {
    p.log.success(`API key stored in OS keychain (${chosen.envKey}).`);
  } else {
    p.log.success(`API key saved to OpenClaw config.`);
  }

  await patchConfig((cfg) => {
    if (provider === "anthropic") {
      cfg.anthropicApiKey = key;
    } else if (provider === "openai") {
      cfg.openaiApiKey = key;
    }
    return cfg;
  });

  return { provider, key };
}
