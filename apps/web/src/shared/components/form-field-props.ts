import type { UseFormRegisterReturn } from 'react-hook-form';

export function formFieldProps(
  register: UseFormRegisterReturn,
  errorId: string,
  hasError: boolean,
) {
  return {
    ...register,
    id: register.name,
    'aria-describedby': hasError ? errorId : undefined,
    'aria-invalid': hasError ? ('true' as const) : undefined,
  };
}
