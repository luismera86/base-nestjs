import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class ForgotPasswordDto {
  @IsEmail({}, { message: i18nValidationMessage('validation.IS_EMAIL') })
  @Transform(({ value }: { value: string }) => value?.toLowerCase().trim())
  email: string;
}
