import { IsIn } from 'class-validator';

export type PresenceStatusValue = 'online' | 'idle' | 'busy' | 'invisible' | 'offline';

export class UpdatePresenceDto {
  @IsIn(['online', 'idle', 'busy', 'invisible', 'offline'])
  desired_status!: PresenceStatusValue;
}
