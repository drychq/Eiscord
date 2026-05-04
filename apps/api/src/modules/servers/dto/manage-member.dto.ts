import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ManageMemberDto {
  @IsString()
  @IsIn(['mute', 'restore', 'remove'])
  action!: 'mute' | 'restore' | 'remove';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string | null;
}
