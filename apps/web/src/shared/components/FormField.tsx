import type { ReactNode } from 'react';

type FormFieldProps = {
  label: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
};

export function FormField({ label, error, children, htmlFor }: FormFieldProps) {
  const id = htmlFor ?? label.replace(/\s+/g, '-').toLowerCase();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error && (
        <p className="form-field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
