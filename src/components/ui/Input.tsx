import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

const control =
  'block w-full rounded-lg border-0 bg-white px-3 text-sm text-navy-900 shadow-sm ring-1 ring-inset ring-navy-200 ' +
  'placeholder:text-navy-400 focus:ring-2 focus:ring-inset focus:ring-brand disabled:bg-navy-50 disabled:text-navy-500';
const invalidCls = 'ring-danger focus:ring-danger';

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(control, 'h-10', invalid && invalidCls, className)} {...rest} />;
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, invalid, children, ...rest }, ref) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={cn(control, 'h-10 pr-8', invalid && invalidCls, className)} {...rest}>
      {children}
    </select>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} aria-invalid={invalid || undefined} className={cn(control, 'py-2', invalid && invalidCls, className)} rows={3} {...rest} />;
});

/** Search box with a leading icon. */
export function SearchInput({ icon, className, ...rest }: InputProps & { icon: ReactNode }) {
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-navy-400">{icon}</span>
      <Input type="search" className="pl-9" {...rest} />
    </div>
  );
}
