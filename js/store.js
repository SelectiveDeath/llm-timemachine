// 조(노트북) 하나의 모든 기록. 브라우저 localStorage에 즉시 저장해서 새로고침해도 유지된다.
// 점수, 환각 도감, 미션 결과는 따로 저장하지 않고 아래 기록에서 매번 계산한다.

const KEY = 'llm-timemachine';
const VERSION = 2;

const fresh = () => ({
  version: VERSION,
  team: null,
  view: 'modern',
  round: 1,
  modern: {
    conv: 1, // 미션 하나 = 대화 하나
    // { id, conv, round, role: 'user'|'assistant', content, ts, pending?, error?, judge?: 0~1, judgeError? }
    messages: [],
    // { id, conv, round, category, difficulty, title, goal, source: 'ai'|'pool', status: 'active'|'success'|'fail'|'cancel', winMsgId, gaveUp?, ts }
    seen: null, // 결과를 확인하고 넘어간 마지막 미션 id
    missions: [],
  },
  past: {
    conv: 1,
    // { id, conv, role, content, ts, pending?, error?, retry?, tags: [], best: false }
    messages: [],
  },
  principle: { writeText: '', temperature: 1 },
  report: {
    // { id, ref, source: 'round1'|'round2'|'past', question, mission?, oldAnswer, modernAnswer,
    //   tags, best, success, memo, present, oldError, modernError }
    items: [],
    generatedAt: null,
    latestRevealed: false, // 🚀 최신 모델 공개를 눌렀는지
  },
});

function migrate(data) {
  if (!data || typeof data !== 'object') return fresh();
  // 버전이 다르면 기록 구조가 달라서 새로 시작한다 (조 이름은 유지)
  if (data.version !== VERSION) return { ...fresh(), team: data.team ?? null };
  const base = fresh();
  return {
    ...base,
    ...data,
    modern: { ...base.modern, ...data.modern },
    past: { ...base.past, ...data.past },
    principle: { ...base.principle, ...data.principle },
    report: { ...base.report, ...data.report },
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

// 메시지 목록에서 AI 답 바로 앞의 학생 질문 찾기 (같은 대화 안에서)
export function questionBefore(messages, index) {
  const conv = messages[index]?.conv;
  for (let j = index - 1; j >= 0; j--) if (messages[j].role === 'user' && messages[j].conv === conv) return messages[j];
  return null;
}

export const missionMessages = (mission) => state.modern.messages.filter((m) => m.conv === mission.conv);
export const missionTries = (mission) => missionMessages(mission).filter((m) => m.role === 'user').length;
export const activeMission = () => state.modern.missions.find((m) => m.status === 'active' && m.round === state.round) ?? null;

// 라운드별 점수: 성공한 미션 난이도 합 vs AI 승리(실패한 미션 수)
export function getScore(round) {
  let team = 0, ai = 0;
  for (const m of state.modern.missions) {
    if (m.round !== round) continue;
    if (m.status === 'success') team += m.difficulty;
    else if (m.status === 'fail') ai++;
  }
  return { team, ai };
}

export function getMissionStats() {
  return [1, 2].map((round) => {
    const done = state.modern.missions.filter((m) => m.round === round && (m.status === 'success' || m.status === 'fail'));
    const wins = done.filter((m) => m.status === 'success');
    return {
      round,
      played: done.length,
      success: wins.length,
      rate: done.length ? wins.length / done.length : 0,
      points: wins.reduce((s, m) => s + m.difficulty, 0),
      missions: done,
    };
  });
}

// 과거 LLM 답 중 관찰 표시가 있는 것 (환각 도감)
export function getDex() {
  const msgs = state.past.messages;
  const out = [];
  msgs.forEach((m, i) => {
    if (m.role !== 'assistant' || m.error || !(m.tags?.length || m.best)) return;
    out.push({ ...m, question: questionBefore(msgs, i)?.content ?? '' });
  });
  return out.sort((a, b) => (b.best - a.best) || b.ts - a.ts);
}
