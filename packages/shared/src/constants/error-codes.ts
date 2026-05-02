export const ErrorCode = {
  AuthRequired: 'AUTH_REQUIRED',
  InvalidCredentials: 'INVALID_CREDENTIALS',
  ValidationFailed: 'VALIDATION_FAILED',
  PermissionDenied: 'PERMISSION_DENIED',
  ResourceNotFound: 'RESOURCE_NOT_FOUND',
  Conflict: 'CONFLICT',
  RateLimited: 'RATE_LIMITED',
  DependencyUnavailable: 'DEPENDENCY_UNAVAILABLE',
  InternalError: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
