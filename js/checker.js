// 정답 확인기: AI 답이 맞았는지 학생이 직접 확인하는 도구

const graphemes = (s) => {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter('ko', { granularity: 'grapheme' }).segment(s), (x) => x.segment);
  }
  return Array.from(s);
};

// 사람이 세는 방식의 글자 수 (한글 한 글자 = 1, 이모지 하나 = 1)
export function countText(text, target = '') {
  const chars = graphemes(text.replace(/\r?\n/g, ''));
  const noSpace = chars.filter((c) => !/\s/.test(c));
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  let targetCount = null;
  if (target) {
    const t = target.trim();
    if (t) {
      targetCount = 0;
      for (let i = text.indexOf(t); i !== -1; i = text.indexOf(t, i + t.length)) targetCount++;
    }
  }
  return { all: chars.length, noSpace: noSpace.length, words, targetCount };
}

// 안전한 계산기 (eval을 쓰지 않음). + - * / % ^ 괄호, ×, ÷, 쉼표 지원
export function calc(expr) {
  const src = expr.replace(/,/g, '').replace(/×/g, '*').replace(/÷/g, '/').replace(/\*\*/g, '^').trim();
  if (!src) throw new Error('계산할 식을 입력하세요.');
  let i = 0;
  const peek = () => src[i];
  const skip = () => { while (src[i] === ' ') i++; };
  const expect = (c) => { skip(); if (src[i] !== c) throw new Error('식이 올바르지 않아요.'); i++; };

  function number() {
    skip();
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(i));
    if (!m) throw new Error('식이 올바르지 않아요.');
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function factor() {
    skip();
    if (peek() === '-') { i++; return -factor(); }
    if (peek() === '+') { i++; return factor(); }
    let v;
    if (peek() === '(') { i++; v = expr0(); expect(')'); } else v = number();
    skip();
    if (peek() === '^') { i++; v = Math.pow(v, factor()); }
    return v;
  }
  function term() {
    let v = factor();
    for (;;) {
      skip();
      const c = peek();
      if (c === '*') { i++; v *= factor(); }
      else if (c === '/') { i++; const d = factor(); if (d === 0) throw new Error('0으로 나눌 수 없어요.'); v /= d; }
      else if (c === '%') { i++; v %= factor(); }
      else return v;
    }
  }
  function expr0() {
    let v = term();
    for (;;) {
      skip();
      const c = peek();
      if (c === '+') { i++; v += term(); }
      else if (c === '-') { i++; v -= term(); }
      else return v;
    }
  }
  const v = expr0();
  skip();
  if (i < src.length) throw new Error('식이 올바르지 않아요.');
  if (!Number.isFinite(v)) throw new Error('결과가 너무 커요.');
  return {
    value: v,
    text: Number.isInteger(v) ? v.toLocaleString('ko-KR') : v.toLocaleString('ko-KR', { maximumFractionDigits: 10 }),
    approx: Math.abs(v) > Number.MAX_SAFE_INTEGER,
  };
}
