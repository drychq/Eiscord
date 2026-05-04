import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ErrorCode } from '@eiscord/shared';

import { AppError } from '../errors/app-error';
import { PermissionAction } from './permission.types';
import { PermissionGuard } from './permission.guard';
import { PermissionsService } from './permissions.service';
import { REQUIRE_PERMISSION_METADATA } from './require-permission.decorator';

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let permissionsService: jest.Mocked<PermissionsService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    permissionsService = {
      assertAllowed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<PermissionsService>;
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new PermissionGuard(permissionsService, reflector);
  });

  function mockHttpContext(params: Record<string, string>, user?: unknown) {
    return {
      getType: () => 'http',
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          params,
          user,
          header: () => undefined,
          headers: {},
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('passes when no permission metadata is set', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = mockHttpContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('passes for non-http context', async () => {
    const ctx = { getType: () => 'ws' } as ExecutionContext;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('throws AUTH_REQUIRED when metadata is set but no user', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      action: PermissionAction.ViewChannel,
      resourceIdParam: 'channel_id',
      resourceType: 'channel',
    });
    const ctx = mockHttpContext({ channel_id: 'ch-1' }, undefined);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject<AppError>({
      code: ErrorCode.AuthRequired,
    });
  });

  it('throws VALIDATION_FAILED when metadata is set but resourceId param is missing', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      action: PermissionAction.ViewChannel,
      resourceIdParam: 'channel_id',
      resourceType: 'channel',
    });
    const ctx = mockHttpContext({}, { userId: 'u-1' });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject<AppError>({
      code: ErrorCode.ValidationFailed,
    });
  });

  it('calls assertAllowed and passes when allowed', async () => {
    reflector.getAllAndOverride.mockReturnValue({
      action: PermissionAction.ViewChannel,
      resourceIdParam: 'channel_id',
      resourceType: 'channel',
    });
    const ctx = mockHttpContext({ channel_id: 'ch-1' }, { userId: 'u-1' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(permissionsService.assertAllowed).toHaveBeenCalledWith({
      action: PermissionAction.ViewChannel,
      resource: { id: 'ch-1', type: 'channel' },
      user: { userId: 'u-1' },
      requestId: expect.any(String) as string,
    });
  });

  it('throws when assertAllowed rejects', async () => {
    permissionsService.assertAllowed.mockRejectedValue(
      new AppError(ErrorCode.PermissionDenied, 'Permission denied.', HttpStatus.FORBIDDEN),
    );
    reflector.getAllAndOverride.mockReturnValue({
      action: PermissionAction.ManageMember,
      resourceIdParam: 'server_id',
      resourceType: 'server',
    });
    const ctx = mockHttpContext({ server_id: 's-1' }, { userId: 'u-1' });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject<AppError>({
      code: ErrorCode.PermissionDenied,
    });
  });
});
