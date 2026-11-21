import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidCronExpression } from '../utils/cron.util.js';

export function IsValidCron(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isValidCron',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid cron expression`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidCronExpression(value);
        },
      },
    });
  };
}
