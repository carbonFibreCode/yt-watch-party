import { useState } from 'react';
import type { SubmitEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ensureIdentity, validateName } from './identity';
import { NameField } from './NameField';

interface NameDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentName: string;
}

/** Rename yourself. Takes effect in a room the next time you (re)join it. */
export function NameDialog({ open, onOpenChange, currentName }: NameDialogProps): ReactElement {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    const invalid = validateName(name);
    if (invalid !== null) {
      setError(invalid);
      return;
    }
    setPending(true);
    try {
      await ensureIdentity(name);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update your name.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={(e) => void submit(e)} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Change your name</DialogTitle>
            <DialogDescription>Others see this name in rooms and in chat.</DialogDescription>
          </DialogHeader>
          <NameField id="rename" value={name} onChange={setName} autoFocus />
          {error !== null && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
