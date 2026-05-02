import { SetMetadata } from '@nestjs/common';

import { AUTH_REQUIRED_METADATA } from './auth.metadata';

export const RequireAuth = () => SetMetadata(AUTH_REQUIRED_METADATA, true);
