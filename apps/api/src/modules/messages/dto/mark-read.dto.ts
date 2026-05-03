import { IsIn, IsUUID, ValidateIf } from 'class-validator';

export class MarkReadDto {
  @IsIn(['channel', 'dm'])
  scope_type!: 'channel' | 'dm';

  @ValidateIf((dto: MarkReadDto) => dto.scope_type === 'channel')
  @IsUUID()
  channel_id?: string;

  @ValidateIf((dto: MarkReadDto) => dto.scope_type === 'dm')
  @IsUUID()
  conversation_id?: string;

  @IsUUID()
  last_read_message_id!: string;
}
