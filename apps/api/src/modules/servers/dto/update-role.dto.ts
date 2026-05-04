import { IsInt, IsOptional, IsString, Length, Matches, MaxLength, Min } from 'class-validator';

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  permission_bits?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;
}
