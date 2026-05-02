import { IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class LoginClientDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  device_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;
}

export class LoginUserDto {
  @IsString()
  @MaxLength(320)
  login_identifier!: string;

  @IsString()
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => LoginClientDto)
  client?: LoginClientDto;
}
