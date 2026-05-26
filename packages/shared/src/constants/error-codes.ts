export const ErrorCode = {
  AuthRequired: 'AUTH_REQUIRED',
  InvalidCredentials: 'INVALID_CREDENTIALS',
  ValidationFailed: 'VALIDATION_FAILED',
  PermissionDenied: 'PERMISSION_DENIED',
  ResourceNotFound: 'RESOURCE_NOT_FOUND',
  Conflict: 'CONFLICT',
  PayloadTooLarge: 'PAYLOAD_TOO_LARGE',
  RateLimited: 'RATE_LIMITED',
  DependencyUnavailable: 'DEPENDENCY_UNAVAILABLE',
  InternalError: 'INTERNAL_ERROR',
  PasswordResetTokenInvalid: 'PASSWORD_RESET_TOKEN_INVALID',
  PasswordResetTooManyAttempts: 'PASSWORD_RESET_TOO_MANY_ATTEMPTS',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
