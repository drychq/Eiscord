import { ErrorCode } from '@eiscord/shared';
import { isApiError } from '../api/api-error';

const ERROR_CODE_MESSAGES: Record<string, string> = {
  [ErrorCode.AuthRequired]: '登录已过期，请重新登录',
  [ErrorCode.InvalidCredentials]: '账号或密码错误',
  [ErrorCode.ValidationFailed]: '输入内容不符合要求，请检查后重试',
  [ErrorCode.PermissionDenied]: '无权执行该操作',
  [ErrorCode.ResourceNotFound]: '资源不存在或已失效',
  [ErrorCode.Conflict]: '操作冲突，请重试',
  [ErrorCode.PayloadTooLarge]: '文件或内容超过大小限制',
  [ErrorCode.RateLimited]: '操作过于频繁，请稍后重试',
  [ErrorCode.DependencyUnavailable]: '该功能暂时不可用，请稍后再试',
  [ErrorCode.InternalError]: '服务器出错，请稍后重试',
};

export function formatErrorMessage(error: unknown, context?: string): string {
  if (isApiError(error)) {
    return ERROR_CODE_MESSAGES[error.code] ?? error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return context ?? '未知错误';
}
