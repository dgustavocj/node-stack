import { Remote } from '../src/Remote';
import { Config } from '../src/Config';

test.skip('Remote', async () => {
  const object = await Remote.loadSecrets({ env: 'local' });

  const config = Config.create(object);

  expect(config.get('a')).toBe('1');
  expect(config.get('b')).toBe('2');
  expect(config.get('mix.c')).toEqual([1, 2, 3]);
});
