import { IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf } from 'class-validator';

export class CreateFriendRequestDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsUUID()
  target_user_id?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{3,32}$/)
  target_username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}
