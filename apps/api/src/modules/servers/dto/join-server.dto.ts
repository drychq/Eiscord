import { IsString, Length, Matches } from 'class-validator';

export class JoinServerDto {
  @IsString()
  @Length(4, 32)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  invite_code!: string;
}
