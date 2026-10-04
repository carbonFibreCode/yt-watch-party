import { describe, expect, it } from 'vitest';
import { describeAction } from './describeAction';

const video = { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', thumbnailUrl: 'x' };

describe('describeAction', () => {
  it.each([
    [{ type: 'play' } as const, 'resume playback'],
    [{ type: 'pause' } as const, 'pause'],
    [{ type: 'seek', time: 83 } as const, 'jump to 1:23'],
    [{ type: 'set_rate', rate: 1.5 } as const, 'play at 1.5× speed'],
    [{ type: 'set_rate', rate: 1 } as const, 'play at normal speed'],
    [{ type: 'change_video', video } as const, 'play “Never Gonna Give You Up”'],
    [{ type: 'queue_add', video } as const, 'queue “Never Gonna Give You Up”'],
  ])('%o → %s', (action, expected) => {
    expect(describeAction(action)).toBe(expected);
  });
});
