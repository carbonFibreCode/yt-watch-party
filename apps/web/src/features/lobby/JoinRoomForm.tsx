import { useState } from 'react';
import type { SubmitEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseJoinInput } from './parseJoinInput';

/** Join by 6-character code or by pasting a shared link. */
export function JoinRoomForm(): ReactElement {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: SubmitEvent): void => {
    event.preventDefault();
    const code = parseJoinInput(input);
    if (code === null) {
      setError('Enter a 6-character room code or paste an invite link.');
      return;
    }
    void navigate(`/r/${code}`);
  };

  return (
    <Card>
      <form onSubmit={submit} className="flex h-full flex-col gap-6">
        <CardHeader>
          <CardTitle>Join a party</CardTitle>
          <CardDescription>Got a code or an invite link? Jump in.</CardDescription>
        </CardHeader>
        <CardContent className="grid flex-1 content-start gap-2">
          <Label htmlFor="join-code">Room code or link</Label>
          <Input
            id="join-code"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(null);
            }}
            placeholder="K7M2QX"
            className="font-mono tracking-widest uppercase placeholder:tracking-widest"
            autoComplete="off"
            aria-invalid={error !== null}
            required
          />
          {error !== null && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" variant="secondary" className="w-full">
            Join room
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
