import { IsBooleanString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListNotificationsDto {
  @IsOptional()
  @IsBooleanString()
  is_read?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
