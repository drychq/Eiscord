import { IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';

export class CreateServerDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string | null;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsUUID()
  icon_attachment_id?: string | null;
}
