import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { findBannedKeyword } from './social-moderation';

describe('findBannedKeyword', () => {
  it('returns the first list keyword on a direct hit', () => {
    assert.equal(findBannedKeyword('please buy this bannedword today'), 'bannedword');
  });

  it('matches case-insensitively and strips whitespace / separators', () => {
    assert.equal(findBannedKeyword('Banned Word'), 'bannedword');
    assert.equal(findBannedKeyword('banned_word'), 'bannedword');
    assert.equal(findBannedKeyword('BANNED-WORD'), 'bannedword');
    assert.equal(findBannedKeyword('加 微 信 号'), '加微信号');
    assert.equal(findBannedKeyword('加_微_信_号'), '加微信号');
  });

  it('does not match ordinary fitness talk', () => {
    assert.equal(findBannedKeyword('今天深蹲 100kg'), null);
    assert.equal(findBannedKeyword('我在做 500 kcal 极低热量减脂'), null);
  });

  it('returns null for empty input', () => {
    assert.equal(findBannedKeyword(''), null);
    assert.equal(findBannedKeyword('   '), null);
  });
});
