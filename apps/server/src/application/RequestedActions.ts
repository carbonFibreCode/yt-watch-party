import type { RequestableAction, UserRef } from '@watchparty/shared';
import type { RequestedAction } from '../domain/RequestBook';
import type { Room } from '../domain/Room';
import type { IdGenerator } from './ports';
import type { VideoResolver } from './VideoResolver';

/**
 * The single implementation of every requestable playback action (LLD SP-10). A moderator's
 * direct command and an approved participant request both go through `prepare` + `apply`,
 * so there is exactly one code path per behavior (rules.md §4.4).
 */
export class RequestedActions {
  constructor(
    private readonly videos: VideoResolver,
    private readonly ids: IdGenerator,
  ) {}

  /** I/O phase, outside the room lock: resolves URLs into embeddable videos. */
  async prepare(action: RequestableAction): Promise<RequestedAction> {
    switch (action.type) {
      case 'play':
      case 'pause':
        return { type: action.type };
      case 'seek':
        return { type: 'seek', time: action.time };
      case 'change_video': {
        const { video, startAt } = await this.videos.resolve(action.url);
        return { type: 'change_video', video, startAt };
      }
      case 'queue_add': {
        const { video } = await this.videos.resolve(action.url);
        return { type: 'queue_add', video };
      }
    }
  }

  /**
   * Pure phase, inside RoomService.mutate. `origin` is who the action is credited to: the actor
   * for a direct command, the requester (not the approver) for an approved request.
   */
  apply(room: Room, action: RequestedAction, origin: UserRef, now: number): void {
    switch (action.type) {
      case 'play':
        room.play(now);
        return;
      case 'pause':
        room.pause(now);
        return;
      case 'seek':
        room.seek(action.time, now);
        return;
      case 'change_video':
        room.changeVideo(action.video, action.startAt, now);
        return;
      case 'queue_add':
        room.enqueue(
          { id: this.ids.next(), video: action.video, addedBy: { userId: origin.userId, name: origin.name } },
          now,
        );
        return;
    }
  }
}
