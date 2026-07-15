import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

// Al menos una minúscula, una mayúscula, un dígito y un carácter especial.
const PASSWORD_STRENGTH =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/;

export class RegisterDto {
  @IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;

  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  @MinLength(8, { message: i18nValidationMessage('validation.MIN_LENGTH') })
  @MaxLength(128, { message: i18nValidationMessage('validation.MAX_LENGTH') })
  @Matches(PASSWORD_STRENGTH, {
    message: i18nValidationMessage('validation.PASSWORD_WEAK'),
  })
  password: string;
}
