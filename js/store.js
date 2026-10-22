// 조(노트북) 하나의 모든 기록. 브라우저 localStorage에 즉시 저장해서 새로고침해도 유지된다.
// 점수, 환각 도감, 라운드 결과는 따로 저장하지 않고 아래 기록에서 매번 계산한다.

const KEY = 'llm-timemachine';
const VERSION = 1;

const fresh = () => ({
  version: VERSION,
  team: null,
  view: 'modern',
  round: 1,
  modern: {
    conv: 1, // 현재 대화 번호 ("새 대화"를 누르면 증가)
    // { id, conv, round, role: 'user'|'assistant', content, ts, verdict: null|'fooled'|'unknown'|'correct', error? }
    messages: [],
  },
  retro: {
    tab: 'write', // write | ask
    writeText: '',
    temperature: 1,
    // { id, question, kind: 'real'|'fake'|null, answers: [], tags: [], best: false, ts }
    questions: [],
  },
  report: {
    // { id, ref, source: 'round1'|'round2'|'retro', question, oldAnswer, modernAnswer,
    //   verdict, tags, memo, present, oldError, modernError }
    items: [],
    generatedAt: null,
  },
});

function migrate(data) {
  if (!data || typeof data !== 'object') return fresh();
  // 구조가 바뀌면 여기서 옛 기록을 새 구조로 옮긴다.
  const base = fresh();
  return {
    ...base,
    ...data,
    modern: { ...base.modern, ...data.modern },
    retro: { ...base.retro, ...data.retro },
    report: { ...base.report, ...data.report },
    version: VERSION,
  };
}

function read() {
  try {
    return migrate(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return fresh();
  }
}

let state = read();
const listeners = new Set();
let saveFailed = false;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveFailed = false;
  } catch {
    // 시크릿 모드 등으로 저장이 막히면 화면은 그대로 동작하고, 경고만 한 번 표시한다.
    if (!saveFailed) console.warn('기록 저장 실패: 시크릿 모드가 아닌 일반 창에서 열어 주세요.');
    saveFailed = true;
  }
}

export const store = {
  get state() {
    return state;
  },
  get saveFailed() {
    return saveFailed;
  },
  // 기록을 바꿀 때는 항상 update를 거친다 → 즉시 저장 + 화면 갱신 알림
  update(fn, { silent = false } = {}) {
    fn(state);
    save();
    if (!silent) for (const l of listeners) l(state);
  },
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset() {
    const team = state.team;
    state = fresh();
    state.team = team;
    save();
    for (const l of listeners) l(state);
  },
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// ── 기록에서 계산하는 값들 ──────────────────────────────

// AI 답변과 그 직전 학생 질문을 짝지어 돌려준다.
export function getAttempts(round = null) {
  const msgs = state.modern.messages;
  const out = [];
  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    if (m.role !== 'assistant' || m.error) continue;
    if (round && m.round !== round) continue;
    let q = null;
    for (let j = i - 1; j >= 0; j--) {
      if (msgs[j].role === 'user' && msgs[j].conv === m.conv) { q = msgs[j]; break; }
    }
    out.push({ question: q?.content ?? '', answer: m.content, verdict: m.verdict, round: m.round, id: m.id });
  }
  return out;
}

export function getScore(round) {
  let team = 0, ai = 0;
  for (const a of getAttempts(round)) {
    if (a.verdict === 'fooled') team++;
    else if (a.verdict === 'unknown' || a.verdict === 'correct') ai++;
  }
  return { team, ai };
}

export function getRoundStats() {
  return [1, 2].map((round) => {
    const judged = getAttempts(round).filter((a) => a.verdict);
    const fooled = judged.filter((a) => a.verdict === 'fooled');
    return {
      round,
      tries: judged.length,
      fooled: fooled.length,
      rate: judged.length ? fooled.length / judged.length : 0,
      wins: fooled,
    };
  });
}

export function getDex() {
  const qs = state.retro.questions.filter((q) => q.answers.length && (q.tags.length || q.best));
  return qs.sort((a, b) => (b.best - a.best) || b.ts - a.ts);
}
