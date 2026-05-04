import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteMessageDto {
  @IsString()
  @IsIn(['retract', 'delete'])
  operation!: 'retract' | 'delete';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string | null;
}
