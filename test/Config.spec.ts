import { Config } from '../src/Config';

test('create', () => {
  const config = Config.create();
  config.set('a.b.c', 'hello');
  config.set('d.e.f', 1);
  config.merge({
    a: {
      b: {
        d: 'dummy',
      },
    },
    d: {
      e: {
        g: true,
      },
    },
  });

  expect(config.get('a.b.c')).toBe('hello');
  expect(config.get('a.b.d')).toBe('dummy');
  expect(config.get('d.e.f')).toBe(1);
  expect(config.get('d.e.g')).toBeTruthy();
  expect(config.get('g.h.i')).toBeUndefined();
});

test('createFromTemplate', () => {
  const config = Config.createFromTemplate({
    a: '1',
    b: '2',
    mix: {
      c: [1, 2, 3],
    },
  });

  expect(config.get('foo.a')).toBe(1);
  expect(config.get('foo.b')).toBe(2);
  expect(config.get('mix')).toEqual([1, 2, 3]);
});
