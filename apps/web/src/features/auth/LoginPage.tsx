import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { loginRequestSchema, type LoginRequest } from '@eiscord/shared';
import { FormField } from '../../shared/components/FormField';
import { formFieldProps } from '../../shared/components/form-field-props';
import { Spinner } from '../../shared/components/Spinner';
import { formatErrorMessage } from '../../shared/utils/error-message';
import { useLoginMutation } from './use-auth-mutations';

export function LoginPage() {
  const mutation = useLoginMutation();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: {
      login_identifier: '',
      password: '',
      client: {
        device_name: navigator.userAgent.slice(0, 24),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    },
  });

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>登录 Eiscord</h1>
        <p className="auth-subtitle">欢迎回来</p>

        {mutation.error && (
          <div className="auth-error" role="alert">
            {formatErrorMessage(mutation.error)}
          </div>
        )}

        <form onSubmit={handleSubmit((data) => mutation.mutate(data))} noValidate>
          <FormField label="用户名 / 邮箱 / 手机号" error={errors.login_identifier?.message}>
            <input
              type="text"
              autoComplete="username"
              {...formFieldProps(
                register('login_identifier'),
                'login_identifier-error',
                !!errors.login_identifier,
              )}
            />
          </FormField>

          <FormField label="密码" error={errors.password?.message}>
            <input
              type="password"
              autoComplete="current-password"
              {...formFieldProps(
                register('password'),
                'password-error',
                !!errors.password,
              )}
            />
          </FormField>

          <button className="form-submit" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner size={18} /> : '登录'}
          </button>
        </form>

        <p className="auth-link">
          <Link to="/forgot-password">忘记密码？</Link>
        </p>

        <p className="auth-link">
          没有账号？<Link to="/register">立即注册</Link>
        </p>
      </div>
    </div>
  );
}
