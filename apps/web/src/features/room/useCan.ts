import { PermissionPolicy } from '@watchparty/shared';
import type { Capability } from '@watchparty/shared';
import { useRoom } from './RoomContext';
import { selectSelf } from './store';

/** UI permission check with the exact policy the server enforces (LLD SP-3). */
export const useCan = (capability: Capability): boolean =>
  useRoom((s) => {
    const self = selectSelf(s);
    return self !== undefined && PermissionPolicy.can(self.role, capability);
  });
