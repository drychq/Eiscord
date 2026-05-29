import { Request } from 'express';

import { AuthenticatedUserContext } from '../auth/auth.types';

export type RequestWithId = Request & {
  requestId?: string;
};

export type AuthenticatedRequest = RequestWithId & {
  user?: AuthenticatedUserContext;
};
