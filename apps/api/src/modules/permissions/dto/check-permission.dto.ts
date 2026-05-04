import { IsIn, IsString, IsUUID } from 'class-validator';

import { PermissionAction } from '../../../common/permissions/permission.types';
import type { PermissionResourceType } from '../../../common/permissions/permission.types';

const permissionActions = Object.values(PermissionAction);
const permissionResourceTypes: PermissionResourceType[] = [
  'attachment',
  'channel',
  'dm',
  'message',
  'server',
  'user',
  'voice',
];

export class CheckPermissionDto {
  @IsIn(permissionActions)
  action!: PermissionAction;

  @IsUUID('4')
  resource_id!: string;

  @IsString()
  @IsIn(permissionResourceTypes)
  resource_type!: PermissionResourceType;
}
