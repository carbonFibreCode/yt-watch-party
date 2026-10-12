import type { ReactElement } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { initials } from '@/lib/format';
import { popColorFor } from '@/lib/popColor';
import { cn } from '@/lib/utils';
import type { ParticipantView } from '@watchparty/shared';
import type { MemberAction } from './memberActions';
import { MemberActionsMenu } from './MemberActionsMenu';
import { RoleBadge } from './RoleBadge';

interface ParticipantRowProps {
  readonly participant: ParticipantView;
  readonly isSelf: boolean;
  readonly actions: readonly MemberAction[];
}

export function ParticipantRow({ participant: p, isSelf, actions }: ParticipantRowProps): ReactElement {
  const away = p.presence === 'away';
  return (
    <li className="flex items-center gap-3 py-2" data-testid={`participant-${p.name}`}>
      <div className="relative">
        <Avatar className={cn('size-8', away && 'opacity-50')}>
          <AvatarFallback className={cn('text-pop-ink text-xs', popColorFor(p.name))}>
            {initials(p.name)}
          </AvatarFallback>
        </Avatar>
        <span
          className={cn(
            'ring-card absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2',
            away ? 'bg-muted-foreground' : 'bg-success',
          )}
          aria-hidden
          // The one round element NeoPOP allows here: a status dot (checked by e2e/design.spec.ts).
          data-neo-round
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">
          {p.name}
          {isSelf && <span className="text-muted-foreground font-normal"> (you)</span>}
        </p>
        {away && <p className="text-muted-foreground text-xs">Reconnecting…</p>}
      </div>
      <RoleBadge role={p.role} />
      {actions.length > 0 ? (
        <MemberActionsMenu target={p} actions={actions} />
      ) : (
        <span className="w-8" aria-hidden />
      )}
    </li>
  );
}
