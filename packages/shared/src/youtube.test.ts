import { describe, expect, it } from 'vitest';
import { parseStartTime, parseYouTubeId, youtubeThumbnailUrl, youtubeWatchUrl } from './youtube';

const ID = 'dQw4w9WgXcQ';

describe('parseYouTubeId', () => {
  it.each([
    ['bare id', ID],
    ['bare id with whitespace', `  ${ID}  `],
    ['watch url', `https://www.youtube.com/watch?v=${ID}`],
    ['watch url without www', `https://youtube.com/watch?v=${ID}`],
    ['mobile watch url', `https://m.youtube.com/watch?v=${ID}`],
    ['watch url with extra params', `https://www.youtube.com/watch?v=${ID}&list=PL123&index=2&t=42s`],
    ['watch url with v not first', `https://www.youtube.com/watch?feature=share&v=${ID}`],
    ['short link', `https://youtu.be/${ID}`],
    ['short link with si and t', `https://youtu.be/${ID}?si=abcDEF123&t=30`],
    ['shorts', `https://www.youtube.com/shorts/${ID}`],
    ['live', `https://www.youtube.com/live/${ID}?feature=share`],
    ['embed', `https://www.youtube.com/embed/${ID}`],
    ['nocookie embed', `https://www.youtube-nocookie.com/embed/${ID}?start=10`],
    ['iframe embed string', `<iframe src="https://www.youtube.com/embed/${ID}" allowfullscreen></iframe>`],
  ])('extracts the id from a %s', (_label, input) => {
    expect(parseYouTubeId(input)).toBe(ID);
  });

  it.each([
    ['empty string', ''],
    ['random text', 'not a video'],
    ['too-short id', 'abc123'],
    ['vimeo url', 'https://vimeo.com/76979871'],
    ['youtube channel url', 'https://www.youtube.com/@somechannel'],
    ['watch url without id', 'https://www.youtube.com/watch'],
  ])('rejects %s', (_label, input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });
});

describe('parseStartTime', () => {
  it.each([
    ['plain seconds', `https://youtu.be/${ID}?t=90`, 90],
    ['seconds with suffix', `https://youtu.be/${ID}?t=90s`, 90],
    ['minutes and seconds', `https://www.youtube.com/watch?v=${ID}&t=1m30s`, 90],
    ['hours, minutes and seconds', `https://www.youtube.com/watch?v=${ID}&t=1h2m3s`, 3723],
    ['hours only', `https://www.youtube.com/watch?v=${ID}&t=2h`, 7200],
    ['start param', `https://www.youtube.com/embed/${ID}?start=15`, 15],
    ['time in hash', `https://www.youtube.com/watch?v=${ID}#t=45`, 45],
  ])('reads %s', (_label, input, expected) => {
    expect(parseStartTime(input)).toBe(expected);
  });

  it.each([
    ['no time param', `https://www.youtube.com/watch?v=${ID}`],
    ['malformed time', `https://www.youtube.com/watch?v=${ID}&t=abc`],
    ['empty time', `https://www.youtube.com/watch?v=${ID}&t=`],
    ['not a url', ID],
  ])('returns null for %s', (_label, input) => {
    expect(parseStartTime(input)).toBeNull();
  });
});

describe('url builders', () => {
  it('builds a canonical watch url', () => {
    expect(youtubeWatchUrl(ID)).toBe(`https://www.youtube.com/watch?v=${ID}`);
  });

  it('builds a thumbnail url', () => {
    expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});
