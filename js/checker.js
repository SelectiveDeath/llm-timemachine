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

// AI 심판에게 줄 "확인된 사실": 질문 속 인용문의 실제 글자 수, 수식의 실제 계산 결과
// (심판 AI도 토큰 단위로 읽어서 글자 수를 잘 못 세므로, 사이트가 직접 센 값을 알려 준다)
export function factsFor(question) {
  const facts = [];
  const quote = /["“”'‘’「『]([^"“”'‘’」』]{2,300})["“”'‘’」』]/.exec(question);
  if (quote && /글자|몇 자|자수|문자/.test(question)) {
    const r = countText(quote[1]);
    facts.push(`질문 속 인용문 "${quote[1]}"의 실제 글자 수: 공백 포함 ${r.all}자, 공백 제외 ${r.noSpace}자.`);
  }
  const expr = /[\d,.]+(?:\s*[+\-×x*÷/^]\s*[\d,.]+)+/.exec(question.replace(/(\d)\s*x\s*(\d)/g, '$1×$2'));
  if (expr && /계산|곱|더하|빼|나누|얼마|몇이야|=|×|÷|\*/.test(question)) {
    try { facts.push(`수식 ${expr[0]}의 정확한 계산 결과: ${calc(expr[0]).text}.`); } catch { /* 수식이 아니면 무시 */ }
  }
  return facts.join(' ').slice(0, 600) || null;
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
