import { Room } from '../../../domain/Room';
import type { RoomSnapshot } from '../../../domain/snapshot';

/** A valid room snapshot at a given version, optionally renamed to tell versions apart. */
export const roomSnapshot = (id = 'K7M2QX', version = 0, name = `v${String(version)}`): RoomSnapshot => ({
  ...Room.create({ id, name, host: { userId: 'u-host', name: 'Hana' }, now: 1_700_000_000_000 }).toSnapshot(),
  version,
});
