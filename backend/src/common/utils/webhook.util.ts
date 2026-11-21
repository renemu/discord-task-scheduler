const ALLOWED_DISCORD_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'canary.discord.com',
  'ptb.discord.com',
]);

const DISCORD_WEBHOOK_PATH_REGEX =
  /^\/api(?:\/v\d+)?\/webhooks\/(\d{17,20})\/([A-Za-z0-9_-]{20,})\/?$/;

const LOCAL_TEST_HOSTS = new Set(['localhost', '127.0.0.1']);

export function isAllowedDiscordWebhookUrl(
  rawUrl: string,
  allowNonDiscord = false,
): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return false;
  }

  if (parsed.username || parsed.password) {
    return false;
  }

  const hostname = parsed.hostname.toLowerCase();

  if (
    parsed.protocol === 'https:' &&
    ALLOWED_DISCORD_HOSTS.has(hostname) &&
    DISCORD_WEBHOOK_PATH_REGEX.test(parsed.pathname)
  ) {
    return true;
  }

  if (
    allowNonDiscord &&
    (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
    LOCAL_TEST_HOSTS.has(hostname)
  ) {
    return true;
  }

  return false;
}

export function maskWebhookUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return '***';
  }
  try {
    const parsed = new URL(rawUrl);
    const match = parsed.pathname.match(DISCORD_WEBHOOK_PATH_REGEX);
    if (match) {
      const webhookId = match[1];
      return `${parsed.origin}/api/webhooks/${webhookId}/***`;
    }
    return `${parsed.origin}/***`;
  } catch {
    return '***';
  }
}
