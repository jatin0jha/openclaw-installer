import * as p from "@clack/prompts";
import { storeSecret } from "./keychain.js";
import { patchConfig } from "./config.js";

interface ChannelOption {
  value: string;
  label: string;
  hint: string;
}

const CHANNELS: ChannelOption[] = [
  {
    value: "telegram",
    label: "Telegram",
    hint: "Requires a bot token from @BotFather",
  },
  {
    value: "discord",
    label: "Discord",
    hint: "Requires a bot token from Discord Developer Portal",
  },
  {
    value: "whatsapp",
    label: "WhatsApp",
    hint: "Uses QR code / phone pairing",
  },
];

async function setupTelegram(): Promise<void> {
  p.log.info(
    "Create a Telegram bot via @BotFather: https://t.me/BotFather",
  );
  const token = await p.password({
    message: "Enter your Telegram bot token:",
    validate: (val) => {
      if (!val || !val.includes(":")) return "Invalid bot token format.";
    },
  });
  if (p.isCancel(token)) return;

  await storeSecret("openclaw-telegram-token", "TELEGRAM_BOT_TOKEN", token);

  await patchConfig((cfg) => {
    cfg.channels = cfg.channels ?? {};
    cfg.channels.telegram = cfg.channels.telegram ?? {};
    cfg.channels.telegram.botToken = token;
    cfg.channels.telegram.enabled = true;
    return cfg;
  });
  p.log.success("Telegram channel configured.");
}

async function setupDiscord(): Promise<void> {
  p.log.info(
    "Create a Discord bot at: https://discord.com/developers/applications",
  );
  const token = await p.password({
    message: "Enter your Discord bot token:",
    validate: (val) => {
      if (!val || val.length < 30) return "Token seems too short.";
    },
  });
  if (p.isCancel(token)) return;

  await storeSecret("openclaw-discord-token", "DISCORD_BOT_TOKEN", token);

  await patchConfig((cfg) => {
    cfg.channels = cfg.channels ?? {};
    cfg.channels.discord = cfg.channels.discord ?? {};
    cfg.channels.discord.botToken = token;
    cfg.channels.discord.enabled = true;
    return cfg;
  });
  p.log.success("Discord channel configured.");
}

async function setupWhatsApp(): Promise<void> {
  p.log.info(
    "WhatsApp uses phone pairing. Run 'openclaw gateway' after setup to scan the QR code.",
  );
  const confirm = await p.confirm({
    message: "Enable WhatsApp channel?",
  });
  if (p.isCancel(confirm) || !confirm) return;

  await patchConfig((cfg) => {
    cfg.channels = cfg.channels ?? {};
    cfg.channels.whatsapp = cfg.channels.whatsapp ?? {};
    cfg.channels.whatsapp.enabled = true;
    cfg.channels.whatsapp.dmPolicy = "pairing";
    return cfg;
  });
  p.log.success("WhatsApp channel enabled. Pair your phone after setup completes.");
}

const SETUP_FNS: Record<string, () => Promise<void>> = {
  telegram: setupTelegram,
  discord: setupDiscord,
  whatsapp: setupWhatsApp,
};

export async function setupChannels(): Promise<void> {
  while (true) {
    const selected = await p.multiselect({
      message: "Which channels do you want to enable? (space to select, enter to confirm)",
      options: CHANNELS.map((ch) => ({
        value: ch.value,
        label: ch.label,
        hint: ch.hint,
      })),
      required: false,
    });

    if (p.isCancel(selected)) {
      p.log.info("Channel setup cancelled — you can add channels later.");
      return;
    }

    if (!selected.length) {
      const skip = await p.confirm({
        message: "No channels were selected. Skip channel setup for now?",
        initialValue: true,
      });
      if (p.isCancel(skip) || skip) {
        p.log.info("No channels selected — you can add them later.");
        return;
      }
      continue;
    }

    for (const channel of selected) {
      const fn = SETUP_FNS[channel];
      if (fn) await fn();
    }
    return;
  }
}
