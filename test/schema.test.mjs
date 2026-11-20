import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('db/schema.sql matches the schema the app applies (lib/db.js)', () => {
  const src = fs.readFileSync(new URL('../lib/db.js', import.meta.url), 'utf8');
  const applied = src.match(/const SCHEMA = `([\s\S]*?)`;/)[1].replace(/^\n/, '');
  const file = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
    .split('\n').filter((l) => !l.startsWith('-- ')).join('\n');
  assert.equal(file, applied);
});
