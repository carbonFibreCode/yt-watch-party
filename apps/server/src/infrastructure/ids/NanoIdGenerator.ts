import { customAlphabet, nanoid } from 'nanoid';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@watchparty/shared';
import type { RoomCode } from '@watchparty/shared';
import type { IdGenerator } from '../../application/ports';

/** Collision-resistant ids and unambiguous room codes via `nanoid` (LLD §2.1). */
export class NanoIdGenerator implements IdGenerator {
  private readonly code = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);

  next(): string {
    return nanoid();
  }

  roomCode(): RoomCode {
    return this.code();
  }
}
