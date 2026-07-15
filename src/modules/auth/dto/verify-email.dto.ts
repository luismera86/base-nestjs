import { IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';

export class VerifyEmailDto {
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  token: string;
}
