import { registerDecorator, ValidationOptions } from 'class-validator';

export function isValidDiscordPayload(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  const content = payload['content'];
  const embeds = payload['embeds'];
  const username = payload['username'];
  const avatarUrl = payload['avatar_url'];
  const tts = payload['tts'];

  const hasContent =
    typeof content === 'string' &&
    content.trim().length > 0 &&
    content.length <= 2000;

  if (content !== undefined && typeof content !== 'string') {
    return false;
  }
  if (typeof content === 'string' && content.length > 2000) {
    return false;
  }

  let hasEmbeds = false;
  if (embeds !== undefined) {
    if (!Array.isArray(embeds) || embeds.length > 10) {
      return false;
    }
    const allObjects = embeds.every(
      (item) => typeof item === 'object' && item !== null && !Array.isArray(item),
    );
    if (!allObjects) {
      return false;
    }
    hasEmbeds = embeds.length > 0;
  }

  if (
    username !== undefined &&
    (typeof username !== 'string' || username.length > 80)
  ) {
    return false;
  }

  if (avatarUrl !== undefined && typeof avatarUrl !== 'string') {
    return false;
  }

  if (tts !== undefined && typeof tts !== 'boolean') {
    return false;
  }

  return hasContent || hasEmbeds;
}

export function IsDiscordPayload(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isDiscordPayload',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid Discord webhook JSON object with non-empty content (<= 2000 chars) or embeds (1-10 objects)`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return isValidDiscordPayload(value);
        },
      },
    });
  };
}
