import { IsEmail, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class RegisterUserDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,32}$/)
  username!: string;

  @IsEmail()
  @MaxLength(320)
  email_or_phone!: string;

  @IsString()
  @Length(8, 128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  verification_token?: string;
}
