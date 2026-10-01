import { describe, expect, it } from 'vitest';
import { StaticSessionResolver, TEST_USER_HEADER } from './StaticSessionResolver';

describe('StaticSessionResolver', () => {
  const resolver = new StaticSessionResolver();

  it('reads "<userId>:<name>", keeping colons inside the name', async () => {
    expect(await resolver.resolve({ [TEST_USER_HEADER]: 'u1:Hana: the host' })).toEqual({
      userId: 'u1',
      name: 'Hana: the host',
      isAnonymous: true,
    });
  });

  it('uses the first value of a repeated header', async () => {
    expect(await resolver.resolve({ [TEST_USER_HEADER]: ['u1:A', 'u2:B'] })).toMatchObject({ userId: 'u1' });
  });

  it.each([[undefined], [''], ['no-separator'], [':name-only'], ['id-only:']])(
    'rejects %j',
    async (value) => {
      expect(await resolver.resolve({ [TEST_USER_HEADER]: value })).toBeNull();
    },
  );
});
