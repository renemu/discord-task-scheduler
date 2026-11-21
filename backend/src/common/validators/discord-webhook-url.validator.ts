import { registerDecorator, ValidationOptions } from 'class-validator';
import { isAllowedDiscordWebhookUrl } from '../utils/webhook.util.js';

export function IsDiscordWebhookUrl(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isDiscordWebhookUrl',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid Discord webhook URL (https://discord.com/api/webhooks/{id}/{token})`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          const allowNonDiscord =
            String(
              process.env['ALLOW_NON_DISCORD_WEBHOOKS'] ?? 'false',
            ).toLowerCase() === 'true';
          return (
            typeof value === 'string' &&
            isAllowedDiscordWebhookUrl(value, allowNonDiscord)
          );
        },
      },
    });
  };
}
