import { CircleCheck, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { SubmitEvent, ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ensureIdentity, hasChosenName, validateName } from '@/features/auth/identity';
import { NameField } from '@/features/auth/NameField';
import { api, ApiError } from '@/lib/api';
import { authClient } from '@/lib/authClient';
import { CreateRoomBody, ERROR_MESSAGES, parseYouTubeId, ROOM_NAME_MAX_LEN } from '@watchparty/shared';

/** Create a room (optionally with a first video) and go straight into it. */
export function CreateRoomForm(): ReactElement {
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const needsName = !hasChosenName(session);
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const detectedVideo = videoUrl.trim() === '' ? null : parseYouTubeId(videoUrl);

  const submit = async (event: SubmitEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    const nameProblem = needsName ? validateName(name) : null;
    const body = CreateRoomBody.safeParse({
      ...(roomName.trim() === '' ? {} : { name: roomName }),
      ...(videoUrl.trim() === '' ? {} : { videoUrl }),
    });
    if (nameProblem !== null || !body.success) {
      setError(nameProblem ?? 'Check the room name and video link.');
      return;
    }
    setPending(true);
    try {
      if (needsName) {
        await ensureIdentity(name);
      }
      const { roomId } = await api.createRoom(body.data);
      await navigate(`/r/${roomId}`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? ERROR_MESSAGES[e.code]
          : e instanceof Error
            ? e.message
            : ERROR_MESSAGES.INTERNAL,
      );
      setPending(false);
    }
  };

  return (
    <Card>
      <form onSubmit={(e) => void submit(e)} className="flex h-full flex-col gap-6">
        <CardHeader>
          <CardTitle>Start a watch party</CardTitle>
          <CardDescription>You'll be the host. Share the link and watch together.</CardDescription>
        </CardHeader>
        <CardContent className="grid flex-1 gap-4">
          {needsName && <NameField id="create-name" value={name} onChange={setName} />}
          <div className="grid gap-2">
            <Label htmlFor="create-room-name">
              Room name <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="create-room-name"
              value={roomName}
              onChange={(e) => {
                setRoomName(e.target.value);
              }}
              placeholder="Friday movie night"
              maxLength={ROOM_NAME_MAX_LEN}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="create-video">
              First video <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Input
              id="create-video"
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value);
              }}
              placeholder="Paste a YouTube link"
              inputMode="url"
              aria-describedby="create-video-hint"
            />
            <p id="create-video-hint" className="text-muted-foreground min-h-5 text-xs" aria-live="polite">
              {detectedVideo !== null && (
                <span className="text-success inline-flex items-center gap-1">
                  <CircleCheck className="size-3.5" /> YouTube video detected
                </span>
              )}
              {detectedVideo === null &&
                videoUrl.trim() !== '' &&
                "That doesn't look like a YouTube link yet."}
            </p>
          </div>
          {error !== null && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Create room
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
