import { IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Length(1, 64)
  nickname?: string;

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsUUID()
  avatar_attachment_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string | null;
}
