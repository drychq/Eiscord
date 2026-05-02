export type AuthenticatedUserContext = {
  accountStatus: 'active' | 'pending_verification' | 'disabled';
  sessionId: string;
  userId: string;
};

export type TokenVerifier = {
  verifyAccessToken(token: string): Promise<AuthenticatedUserContext | null>;
};

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');
