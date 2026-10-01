import { useState } from 'react';
import type { SubmitEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { authClient } from '@/lib/authClient';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@watchparty/shared';
import { NameField } from './NameField';

export type AuthMode = 'sign-up' | 'sign-in';

interface AuthDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly initialMode: AuthMode;
  readonly suggestedName: string;
}

/**
 * Email/password account (LLD SP-2). Signing up or in while a guest links the guest's
 * "recent rooms" to the account.
 */
export function AuthDialog({
  open,
  onOpenChange,
  initialMode,
  suggestedName,
}: AuthDialogProps): ReactElement {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState(suggestedName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result =
      mode === 'sign-up'
        ? await authClient.signUp.email({ email, password, name: name.trim() })
        : await authClient.signIn.email({ email, password });
    setPending(false);
    if (result.error !== null) {
      setError(result.error.message ?? 'Something went wrong. Please try again.');
      return;
    }
    onOpenChange(false);
  };

  const credentials = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="auth-email">Email</Label>
        <Input
          id="auth-email"
          type="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
          autoComplete="email"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="auth-password">Password</Label>
        <Input
          id="auth-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          required
        />
      </div>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'sign-up' ? 'Create an account' : 'Welcome back'}</DialogTitle>
          <DialogDescription>
            Keep your rooms across devices. Your recent rooms come with you.
          </DialogDescription>
        </DialogHeader>
        <Tabs
          value={mode}
          onValueChange={(value) => {
            setMode(value === 'sign-in' ? 'sign-in' : 'sign-up');
            setError(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sign-up">Sign up</TabsTrigger>
            <TabsTrigger value="sign-in">Sign in</TabsTrigger>
          </TabsList>
          <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-4">
            <TabsContent value="sign-up" className="grid gap-4">
              <NameField id="auth-name" value={name} onChange={setName} />
            </TabsContent>
            {credentials}
            {error !== null && (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {mode === 'sign-up' ? 'Create account' : 'Sign in'}
            </Button>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
