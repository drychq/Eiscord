import { IsBoolean, IsIn, IsOptional, ValidateIf } from 'class-validator';

export type VoiceConnectionStatusValue =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export class UpdateVoiceStateDto {
  @IsOptional()
  @IsBoolean()
  mute_state?: boolean;

  @IsOptional()
  @IsBoolean()
  deafen_state?: boolean;

  @IsOptional()
  @IsIn(['connecting', 'connected', 'reconnecting', 'disconnected'])
  connection_status?: VoiceConnectionStatusValue;

  @ValidateIf(
    (value: UpdateVoiceStateDto) =>
      value.mute_state === undefined &&
      value.deafen_state === undefined &&
      value.connection_status === undefined,
  )
  private readonly at_least_one_field?: never;
}
