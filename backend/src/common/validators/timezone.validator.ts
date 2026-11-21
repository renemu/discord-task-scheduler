import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidTimezone } from '../utils/cron.util.js';

export function IsValidTimezone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isValidTimezone',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid IANA timezone (e.g., UTC, Asia/Jakarta)`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidTimezone(value);
        },
      },
    });
  };
}
