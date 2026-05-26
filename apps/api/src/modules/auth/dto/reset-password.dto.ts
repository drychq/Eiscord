import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;

  @IsString()
  @Length(8, 128)
  new_password!: string;
}
