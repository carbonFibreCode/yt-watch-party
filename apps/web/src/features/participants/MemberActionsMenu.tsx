import { Crown, Ellipsis, Shield, UserMinus, UserRound, Eye } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRpc } from '@/features/room/RoomContext';
import { roleLabel } from '@/lib/format';
import type { ParticipantView } from '@watchparty/shared';
import type { MemberAction } from './memberActions';

const ROLE_ICONS = { moderator: <Shield />, participant: <UserRound />, viewer: <Eye /> } as const;

type Pending = 'transfer' | 'remove' | null;

/** Per-member actions for the host and moderators; only offers what the server would allow. */
export function MemberActionsMenu({
  target,
  actions,
}: {
  readonly target: ParticipantView;
  readonly actions: readonly MemberAction[];
}): ReactElement {
  const rpc = useRpc();
  const [pending, setPending] = useState<Pending>(null);
  const run = (call: Promise<unknown>): void => {
    call.catch(() => undefined);
  };
  const assignments = actions.flatMap((a) => (a.kind === 'assign' ? [a.role] : []));
  const canTransfer = actions.some((a) => a.kind === 'transfer');
  const canRemove = actions.some((a) => a.kind === 'remove');

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${target.name}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="truncate">{target.name}</DropdownMenuLabel>
          {assignments.map((role) => (
            <DropdownMenuItem
              key={role}
              onSelect={() => {
                run(rpc('assign_role', { userId: target.userId, role }));
              }}
            >
              {ROLE_ICONS[role]} Make {roleLabel(role).toLowerCase()}
            </DropdownMenuItem>
          ))}
          {canTransfer && (
            <DropdownMenuItem
              onSelect={() => {
                setPending('transfer');
              }}
            >
              <Crown /> Make host
            </DropdownMenuItem>
          )}
          {canRemove && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  setPending('remove');
                }}
              >
                <UserMinus /> Remove from room
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={pending === 'transfer'}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={`Make ${target.name} the host?`}
        description="They get full control of the room. You become a moderator."
        confirmLabel="Make host"
        onConfirm={() => {
          run(rpc('transfer_host', { userId: target.userId }));
        }}
      />
      <ConfirmDialog
        open={pending === 'remove'}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title={`Remove ${target.name}?`}
        description="They'll be sent out of the room and can't rejoin it."
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          run(rpc('remove_participant', { userId: target.userId }));
        }}
      />
    </>
  );
}
