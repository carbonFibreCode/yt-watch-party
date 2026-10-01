import type { ReactElement } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DISPLAY_NAME_MAX_LEN } from '@watchparty/shared';

interface NameFieldProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly autoFocus?: boolean;
}

/** The "your name" input used wherever a guest identity is created or changed. */
export function NameField({ id, value, onChange, autoFocus = false }: NameFieldProps): ReactElement {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Your name</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        placeholder="e.g. Sam"
        maxLength={DISPLAY_NAME_MAX_LEN}
        autoComplete="nickname"
        autoFocus={autoFocus}
        required
      />
    </div>
  );
}
