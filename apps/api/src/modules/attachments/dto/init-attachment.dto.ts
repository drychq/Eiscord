import { IsIn, IsInt, IsString, Length, Min } from 'class-validator';

export class InitAttachmentDto {
  @IsString()
  @Length(1, 255)
  file_name!: string;

  @IsString()
  @Length(1, 120)
  mime_type!: string;

  @IsInt()
  @Min(1)
  size_bytes!: number;

  @IsIn(['avatar', 'message', 'server_icon'])
  purpose!: 'avatar' | 'message' | 'server_icon';
}
