import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class MarkNotificationsReadDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  notification_ids?: string[];

  @IsOptional()
  @IsBoolean()
  mark_all?: boolean;
}
