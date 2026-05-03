import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  content?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  attachment_ids?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  mention_user_ids?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  client_message_id?: string | null;
}
