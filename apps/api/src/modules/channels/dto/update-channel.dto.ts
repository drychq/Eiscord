import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Length, MaxLength, ValidateNested } from 'class-validator';

import { PermissionOverwriteDto } from './permission-overwrite.dto';

export class UpdateChannelDto {
  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsIn(['text', 'voice'])
  type?: 'text' | 'voice';

  @IsOptional()
  @IsString()
  @MaxLength(280)
  topic?: string | null;

  @IsOptional()
  @IsInt()
  sort_order?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionOverwriteDto)
  permission_overwrites?: PermissionOverwriteDto[];
}
