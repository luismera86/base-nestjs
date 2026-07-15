import { IsString } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { IsStrongPassword } from '../../../common/decorators/is-strong-password.decorator';

export class ResetPasswordDto {
  @IsString({ message: i18nValidationMessage('validation.IS_STRING') })
  token: string;

  @IsStrongPassword()
  password: string;
}
