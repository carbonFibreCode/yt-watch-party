import type { ReactElement } from 'react';
import { useRoom } from '@/features/room/RoomContext';
import { selectSelf } from '@/features/room/store';
import type { ParticipantView } from '@watchparty/shared';
import { ROLE_RANK } from '@watchparty/shared';
import { memberActions } from './memberActions';
import { ParticipantRow } from './ParticipantRow';

const byRankThenJoin = (a: ParticipantView, b: ParticipantView): number =>
  ROLE_RANK[b.role] - ROLE_RANK[a.role] || a.joinedAt - b.joinedAt;

/** Everyone in the room with role, presence and the actions the current user may take on them. */
export function ParticipantList(): ReactElement {
  const participants = useRoom((s) => s.participants);
  const self = useRoom(selectSelf);
  const sorted = [...participants].sort(byRankThenJoin);

  return (
    <ul className="grid gap-1" aria-label="People in the room">
      {sorted.map((p) => (
        <ParticipantRow
          key={p.userId}
          participant={p}
          isSelf={p.userId === self?.userId}
          actions={self === undefined ? [] : memberActions(self, p)}
        />
      ))}
    </ul>
  );
}
