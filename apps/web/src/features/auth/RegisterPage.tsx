import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { registerRequestSchema, type RegisterRequest } from '@eiscord/shared';
import { FormField } from '../../shared/components/FormField';
import { formFieldProps } from '../../shared/components/form-field-props';
import { Spinner } from '../../shared/components/Spinner';
import { useRegisterMutation } from './use-auth-mutations';
import { useState } from 'react';

const registerFormSchema = registerRequestSchema
  .extend({
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '两次密码输入不一致',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof registerFormSchema>;

export function RegisterPage() {
  const mutation = useRegisterMutation();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: '',
      email_or_phone: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = (data: RegisterForm) => {
    setServerError(null);
    const input: RegisterRequest = {
      username: data.username,
      email_or_phone: data.email_or_phone,
      password: data.password,
    };
    mutation.mutate(input, {
      onError: (err) => {
        setServerError(err instanceof Error ? err.message : '注册失败，请重试');
      },
    });
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>注册 Eiscord</h1>
        <p className="auth-subtitle">创建账号，开始实时社区协作</p>

        {serverError && (
          <div className="auth-error" role="alert">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <FormField label="用户名" error={errors.username?.message} htmlFor="username">
            <input
              type="text"
              autoComplete="username"
              placeholder="3-32 位字母、数字或下划线"
              {...formFieldProps(
                register('username'),
                'username-error',
                !!errors.username,
              )}
            />
          </FormField>

          <FormField
            label="邮箱"
            error={errors.email_or_phone?.message}
            htmlFor="email_or_phone"
          >
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              {...formFieldProps(
                register('email_or_phone'),
                'email_or_phone-error',
                !!errors.email_or_phone,
              )}
            />
          </FormField>

          <FormField label="密码" error={errors.password?.message} htmlFor="password">
            <input
              type="password"
              autoComplete="new-password"
              placeholder="至少 8 位，含字母和数字"
              {...formFieldProps(
                register('password'),
                'password-error',
                !!errors.password,
              )}
            />
          </FormField>

          <FormField
            label="确认密码"
            error={errors.confirmPassword?.message}
            htmlFor="confirmPassword"
          >
            <input
              type="password"
              autoComplete="new-password"
              {...formFieldProps(
                register('confirmPassword'),
                'confirmPassword-error',
                !!errors.confirmPassword,
              )}
            />
          </FormField>

          <button className="form-submit" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner size={18} /> : '注册'}
          </button>
        </form>

        <p className="auth-link">
          已有账号？<Link to="/login">立即登录</Link>
        </p>
      </div>
    </div>
  );
}
