import { IsArray, IsIn, IsInt, IsOptional, IsString, Length, MaxLength } from 'class-validator';

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
  permission_overwrites?: unknown[];
}
