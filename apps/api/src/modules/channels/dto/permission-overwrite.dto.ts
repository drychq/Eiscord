import { IsIn, IsString, IsUUID, Matches } from 'class-validator';

export class PermissionOverwriteDto {
  @IsString()
  @IsIn(['role', 'member'])
  target_type!: 'role' | 'member';

  @IsUUID('4')
  target_id!: string;

  @IsString()
  @Matches(/^\d+$/)
  allow_bits!: string;

  @IsString()
  @Matches(/^\d+$/)
  deny_bits!: string;
}
