const test = require('node:test');
const assert = require('node:assert');
const {
  targetOf,
  wordFor,
  allNamesSubmitted,
  reorderPlayer,
  resetWrittenNames,
  generateCode,
  CODE_LENGTH,
  CODE_ALPHABET,
} = require('../src/rooms');

function mk(ids) {
  return ids.map((id) => ({ id, name: id, writtenName: null, connected: true }));
}

test('targetOf: bir sonraki oyuncuyu döner, son -> ilk (halka)', () => {
  const p = mk(['A', 'B', 'C']);
  assert.strictEqual(targetOf(p, 'A').id, 'B');
  assert.strictEqual(targetOf(p, 'B').id, 'C');
  assert.strictEqual(targetOf(p, 'C').id, 'A');
});

test('targetOf: bilinmeyen id veya tek oyuncu için null', () => {
  assert.strictEqual(targetOf(mk(['A', 'B']), 'Z'), null);
  assert.strictEqual(targetOf(mk(['A']), 'A'), null);
});

test('wordFor: önceki oyuncunun yazdığı isim', () => {
  const p = mk(['A', 'B', 'C']);
  p[0].writtenName = 'wa'; // A, B icin yazar
  p[1].writtenName = 'wb'; // B, C icin yazar
  p[2].writtenName = 'wc'; // C, A icin yazar
  assert.strictEqual(wordFor(p, 'B'), 'wa'); // B'nin oncesi A
  assert.strictEqual(wordFor(p, 'C'), 'wb'); // C'nin oncesi B
  assert.strictEqual(wordFor(p, 'A'), 'wc'); // A'nin oncesi C (halka)
});

test('allNamesSubmitted: hepsi dolu mu', () => {
  const p = mk(['A', 'B', 'C']);
  assert.strictEqual(allNamesSubmitted(p), false);
  p.forEach((x) => (x.writtenName = 'x'));
  assert.strictEqual(allNamesSubmitted(p), true);
  p[1].writtenName = ''; // bos isim sayilmaz
  assert.strictEqual(allNamesSubmitted(p), false);
});

test('reorderPlayer: yukarı/aşağı taşır, yeni dizi döner', () => {
  const p = mk(['A', 'B', 'C']);
  const up = reorderPlayer(p, 'B', 'up');
  assert.deepStrictEqual(up.map((x) => x.id), ['B', 'A', 'C']);
  const down = reorderPlayer(p, 'B', 'down');
  assert.deepStrictEqual(down.map((x) => x.id), ['A', 'C', 'B']);
  assert.deepStrictEqual(p.map((x) => x.id), ['A', 'B', 'C']); // orijinal değişmez
});

test('reorderPlayer: sınırlarda değişiklik yok', () => {
  const p = mk(['A', 'B', 'C']);
  assert.deepStrictEqual(reorderPlayer(p, 'A', 'up').map((x) => x.id), ['A', 'B', 'C']);
  assert.deepStrictEqual(reorderPlayer(p, 'C', 'down').map((x) => x.id), ['A', 'B', 'C']);
});

test('resetWrittenNames: tüm yazılan isimleri temizler', () => {
  const p = mk(['A', 'B']);
  p.forEach((x) => (x.writtenName = 'x'));
  const r = resetWrittenNames(p);
  assert.ok(r.every((x) => x.writtenName === null));
  assert.ok(p.every((x) => x.writtenName === 'x')); // orijinal değişmez
});

test('generateCode: doğru uzunluk ve sadece izinli karakterler', () => {
  for (let i = 0; i < 50; i++) {
    const code = generateCode();
    assert.strictEqual(code.length, CODE_LENGTH);
    assert.ok([...code].every((ch) => CODE_ALPHABET.includes(ch)));
  }
});
