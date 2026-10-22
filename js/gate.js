// 수업 단계 잠금: 선생님이 관리자 패널(admin.html)에서 연 단계까지만 쓸 수 있다.
// 몇 초마다 Worker에 현재 단계를 물어보고, 그때 조 현황(화면, 점수 요약)도 함께 보낸다.
import { MODERN } from './config.js';
import { currentMode } from './modern-llm.js';
import { store } from './store.js';

// 수업 순서. step 번호까지 열리면 그 단계를 쓸 수 있다.
export const STEPS = [
  { n: 1, view: 'modern', icon: '🎯', label: '속이기 미션 1라운드' },
  { n: 2, view: 'principle', icon: '🧩', label: '원리 체험' },
  { n: 3, view: 'past', icon: '📼', label: '과거 LLM' },
  { n: 4, view: 'modern', icon: '🧠', label: '속이기 미션 2라운드' },
  { n: 5, view: 'report', icon: '⚖️', label: '비교 리포트' },
  { n: 6, view: 'report', icon: '🚀', label: '최신 모델 공개' },
];
export const MAX_STEP = STEPS.length;

// 각 화면이 열리는 단계
const VIEW_STEP = { modern: 1, results: 1, principle: 2, past: 3, dex: 3, report: 5 };
export const viewStep = (view) => VIEW_STEP[view] ?? 1;

const POLL_MS = 3000;
const HEARTBEAT_EVERY = 4; // 4번에 한 번(약 12초마다) 조 현황 기록
// 같은 브라우저의 관리자 패널이 단계를 바꾸면 기다리지 않고 바로 확인하도록 알리는 채널
export const GATE_CHANNEL = 'llm-timemachine-gate';

const listeners = new Set();
let timer = null, polls = 0;

// 연습 모드(?mock)나 서버가 없으면 모든 단계를 연다
const ungated = () => currentMode() === 'mock' || !MODERN.workerUrl;

export const gate = {
  get step() { return ungated() ? MAX_STEP : store.state.gate.step; },
  online: true,
  isOpen(view) { return this.step >= viewStep(view); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  // summary(): 관리자 패널에 보여 줄 조 현황 요약
  start(summary) {
    if (timer || ungated()) return;
    let inFlight = false;
    const tick = async () => {
      clearTimeout(timer);
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(MODERN.workerUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: { team: store.state.team, view: store.state.view, summary: summary(), heartbeat: polls++ % HEARTBEAT_EVERY === 0 } }),
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(res.status);
        apply(await res.json());
        setOnline(true);
      } catch {
        setOnline(false); // 연결이 끊겨도 마지막으로 열린 단계까지는 계속 쓸 수 있다
      }
      inFlight = false;
      timer = setTimeout(tick, POLL_MS);
    };
    tick();
    // 뒤에 있던 탭은 브라우저가 타이머를 늦추므로, 다시 보이는 순간 바로 확인
    document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
    window.addEventListener('focus', tick);
    try { new BroadcastChannel(GATE_CHANNEL).onmessage = tick; } catch { /* 지원하지 않는 브라우저 */ }
  },
};

function apply({ step, session }) {
  const prev = store.state.gate;
  // 선생님이 "새 수업 시작"을 누르면 수업 id가 바뀐다 → 이 노트북의 기록을 지우고 처음부터
  if (prev.session && session && prev.session !== session) {
    store.wipe();
    store.update((s) => { s.gate = { step, session }; });
    location.reload();
    return;
  }
  if (prev.step === step && prev.session === session) return;
  store.update((s) => { s.gate = { step, session }; }, { silent: true });
  for (const fn of listeners) fn({ step, prevStep: prev.step });
}

function setOnline(v) {
  if (gate.online === v) return;
  gate.online = v;
  for (const fn of listeners) fn({ step: gate.step, prevStep: gate.step });
}
