import { InMemoryRoomRepository } from './InMemoryRoomRepository';
import { describeRoomRepository } from './test/roomRepositoryContract';

describeRoomRepository('InMemoryRoomRepository', () => new InMemoryRoomRepository());
