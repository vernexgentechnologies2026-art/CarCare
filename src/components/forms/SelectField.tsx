import { forwardRef, type ReactNode, type SelectHTMLAttributes } from 'react';
import { Select } from '../ui/Input';
import { FormField } from './FormField';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectOptionGroup {
  label: string;
  options: SelectOption[];
}

type SelectFieldProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
  label: string;
  error?: string;
  hint?: ReactNode;
  /** Optional leading empty choice, e.g. "Select a block". */
  placeholder?: string;
  options?: SelectOption[];
  groups?: SelectOptionGroup[];
  className?: string;
};

/** Labelled select that works with `register()` from react-hook-form or as a controlled input. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, error, hint, required, placeholder, options = [], groups = [], className, ...rest },
  ref,
) {
  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      {(p) => (
        <Select ref={ref} id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      )}
    </FormField>
  );
});
