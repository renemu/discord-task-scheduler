export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  timestamp?: string;
  color?: number;
  footer?: { text: string; icon_url?: string };
  fields?: DiscordEmbedField[];
  [key: string]: unknown;
}

export interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  embeds?: DiscordEmbed[];
  allowed_mentions?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DiscordDeliveryResult {
  success: boolean;
  retryable: boolean;
  httpStatus: number | null;
  durationMs: number;
  message: string;
  retryAfterMs: number | null;
}
