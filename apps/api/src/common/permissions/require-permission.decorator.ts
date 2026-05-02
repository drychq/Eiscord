import { SetMetadata } from '@nestjs/common';

import { PermissionAction, PermissionResourceType } from './permission.types';

export const REQUIRE_PERMISSION_METADATA = 'eiscord:permission:required';

export type PermissionRequirement = {
  action: PermissionAction;
  resourceIdParam: string;
  resourceType: PermissionResourceType;
};

export function RequirePermission(requirement: PermissionRequirement) {
  return SetMetadata(REQUIRE_PERMISSION_METADATA, requirement);
}

export function RequirePermissionForParam(
  action: PermissionAction,
  resourceType: PermissionResourceType,
  resourceIdParam: string,
) {
  return RequirePermission({ action, resourceType, resourceIdParam });
}
