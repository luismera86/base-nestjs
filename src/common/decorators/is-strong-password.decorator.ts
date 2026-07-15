import { applyDecorators } from '@nestjs/common';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

// Al menos una minúscula, una mayúscula, un dígito y un carácter especial.
export const PASSWORD_STRENGTH =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/;

/**
 * Política de contraseña: 8–128 caracteres + minúscula, mayúscula, número y
 * carácter especial. Reutilizable en cualquier DTO que reciba una contraseña.
 */
export function IsStrongPassword(): PropertyDecorator {
  return applyDecorators(
    IsString({ message: i18nValidationMessage('validation.IS_STRING') }),
    MinLength(8, { message: i18nValidationMessage('validation.MIN_LENGTH') }),
    MaxLength(128, { message: i18nValidationMessage('validation.MAX_LENGTH') }),
    Matches(PASSWORD_STRENGTH, {
      message: i18nValidationMessage('validation.PASSWORD_WEAK'),
    }),
  );
}
