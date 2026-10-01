import { Loader2, Users } from 'lucide-react';
import { useState } from 'react';
import type { SubmitEvent, ReactElement } from 'react';
import { AppHeader } from '@/app/AppHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ensureIdentity, validateName } from '@/features/auth/identity';
import { NameField } from '@/features/auth/NameField';
import type { RoomPreview } from '@watchparty/shared';

/** Shown to visitors without a name: what they are joining, and a single name field. */
export function GuestJoinCard({ preview }: { readonly preview: RoomPreview }): ReactElement {
  const [name, setName] = useState('');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join. Please try again.');
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />
      <main className="grid flex-1 place-items-center px-4 py-10">
        <Card className="w-full max-w-md gap-0 overflow-hidden pt-0">
          {preview.video !== null && (
            <img
              src={preview.video.thumbnailUrl}
              alt=""
              className="bg-muted aspect-video w-full object-cover"
            />
          )}
          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-6 pt-6">
            <CardHeader>
              <CardTitle className="text-xl">{preview.name}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <Users className="size-4" />
                {preview.hostName === null ? 'Nobody here yet' : `Hosted by ${preview.hostName}`} ·{' '}
                {preview.participantCount} watching
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <NameField id="guest-name" value={name} onChange={setName} autoFocus />
              {error !== null && (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Join the party
              </Button>
            </CardFooter>
          </form>
        </Card>
      </main>
    </div>
  );
}
