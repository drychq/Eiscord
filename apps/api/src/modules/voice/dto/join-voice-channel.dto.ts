import { IsBoolean, IsOptional } from 'class-validator';

export class JoinVoiceChannelDto {
  @IsOptional()
  @IsBoolean()
  initial_mute_state?: boolean;

  @IsOptional()
  @IsBoolean()
  initial_deafen_state?: boolean;
}
