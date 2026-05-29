import { SetMetadata } from '@nestjs/common';

import { AUTH_PUBLIC_METADATA } from './auth.metadata';

export const Public = () => SetMetadata(AUTH_PUBLIC_METADATA, true);
