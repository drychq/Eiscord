import { IsUUID } from 'class-validator';

export class AssignMemberRoleDto {
  @IsUUID('4')
  role_id!: string;
}
