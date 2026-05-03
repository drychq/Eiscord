import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateFriendRequestDto {
  @IsUUID()
  target_user_id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}
