// 앱 시작점: 조 이름 입력, "오늘의 순서" 사이드바, 단계 잠금, 화면 전환
import { store, getScore } from './store.js';
import { h, clear, confirmDialog, promptDialog, toast } from './ui.js';
import { kogpt2 } from './kogpt2.js';
import { currentMode, isDev, getDevSettings, setDevSettings } from './modern-llm.js';
import { MODELS } from './config.js';
import { gate, STEPS, viewStep, REVEAL_STEP } from './gate.js';
import * as modernView from './views/modern.js';
import * as principleView from './views/principle.js';
import * as pastView from './views/past.js';
import * as reportView from './views/report.js';
import * as dexView from './views/dex.js';
import * as resultsView from './views/results.js';

const VIEWS = { modern: modernView, principle: principleView, past: pastView, report: reportView, dex: dexView, results: resultsView };
const tag = (m) => `${m.id} · ${m.year}`;
// 사이드바 단계 밑에 보여 줄 모델 (깜짝 공개 모델은 열리기 전까지 숨김)
const STEP_SUB = {
  1: tag(MODELS.modern), 2: tag(MODELS.principle), 3: tag(MODELS.past),
  4: `${MODELS.past.id} vs ${MODELS.modern.id}`, 5: () => (gate.step >= REVEAL_STEP ? MODELS.latest.id : '???'),
};

const app = document.getElementById('app');
let current = null; // { name, view, locked }
let main, stepsNav;

if (!store.state.team) showOnboarding();
else start();

function showOnboarding() {
  const input = h('input.input.onboard-input', { placeholder: '예: 3조', maxlength: 20 });
  const go = () => {
    const team = input.value.trim();
    if (!team) { input.focus(); return; }
    store.update((s) => { s.team = team; });
    start();
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && !e.isComposing && go());
  clear(app).append(
    h('div.onboard',
      h('div.onboard-card',
        h('div.onboard-logo', '⏳'),
        h('h1', 'LLM 타임머신'),
        h('p.onboard-sub', '과거 LLM과 현대 LLM, 무엇이 달라졌을까?'),
        h('label.onboard-label', '우리 조 이름'),
        input,
        h('button.btn.btn-primary.btn-lg', { onclick: go }, '시작하기'),
        h('p.onboard-note', '이 노트북의 기록은 우리 조 이름으로 저장돼요. 새로고침해도 사라지지 않아요.'))));
  input.focus();
}

function start() {
  main = h('main.main');
  clear(app).append(h('div.layout', buildSidebar(), main));
  window.addEventListener('hashchange', route);
  route();

  gate.subscribe(onGate);
  gate.start(summary);
  // 원리 체험용 KoGPT2는 미리 받아 둔다 (파트 1.5 전에 다운로드가 끝나 있도록)
  kogpt2.load().catch(() => {});
}

// 관리자 패널에 보낼 조 현황 (대화 내용은 보내지 않음)
function summary() {
  const s = store.state;
  const all = [...s.modern.missions, ...s.past.missions];
  return {
    modern: getScore(1).team, past: getScore(1, 'past').team,
    missions: all.filter((m) => m.status === 'success' || m.status === 'fail').length,
    wins: all.filter((m) => m.status === 'success').length,
    report: s.report.items.length,
  };
}

// 선생님이 단계를 바꿨을 때
function onGate({ step, prevStep }) {
  renderSteps();
  // 최신 모델 공개 단계가 열리는 순간, 어느 화면에 있든 크게 알린다
  if (step >= REVEAL_STEP && prevStep < REVEAL_STEP) revealOverlay();
  // 새 단계가 열리면 모든 학생 화면을 그 활동으로 데려간다
  if (step > prevStep) {
    const opened = STEPS.find((s) => s.n === step);
    if (opened) {
      toast(`${opened.icon} ${opened.label} 단계가 열렸어요!`, 3500);
      if (current?.name !== opened.view) {
        location.hash = '#/' + opened.view; // hashchange → route()
        return;
      }
    }
  }
  // 보고 있던 화면의 잠금 상태가 바뀌었으면 다시 그린다
  if (current && current.locked !== !gate.isOpen(current.name)) {
    const name = current.name;
    current.view.unmount?.();
    current = null;
    show(name);
  }
}

function route() {
  let name = location.hash.replace(/^#\/?/, '');
  if (!VIEWS[name]) {
    // 주소에 화면이 없으면: 마지막으로 보던 화면, 잠겨 있으면 지금 단계의 화면
    const last = store.state.view;
    const now = STEPS.find((s) => s.n === Math.max(1, Math.min(gate.step, 4)));
    name = VIEWS[last] && gate.isOpen(last) ? last : now.view;
    history.replaceState(null, '', '#/' + name);
  }
  if (current?.name === name) return;
  show(name);
}

function show(name) {
  current?.view.unmount?.();
  store.update((s) => { s.view = name; }, { silent: true });
  clear(main);
  const locked = !gate.isOpen(name);
  main.className = 'main view-' + (locked ? 'locked' : name);
  current = { name, view: locked ? lockView : VIEWS[name], locked };
  current.view.mount(main, name);
  renderSteps();
  document.body.classList.remove('nav-open');
}

// 🚀 최신 모델 공개 연출 (4초 뒤 또는 누르면 닫힘)
function revealOverlay() {
  const overlay = h('div.reveal-overlay', { onclick: () => overlay.remove() },
    h('div.reveal-box',
      h('div.reveal-rocket', '🚀'),
      h('div.reveal-small', '그리고 마지막으로…'),
      h('h1', `최신 모델 ${MODELS.latest.id} 등장!`),
      h('p', '같은 질문에 가장 최신 모델은 어떻게 답할까요? 리포트의 오른쪽 칸을 확인하세요.')));
  document.body.append(overlay);
  setTimeout(() => overlay.remove(), 4500);
}

// 잠긴 화면
const lockView = {
  mount(el, name) {
    const need = STEPS.find((s) => s.n === viewStep(name));
    const now = STEPS.find((s) => s.n === gate.step);
    el.append(h('div.lock-screen',
      h('div.lock-icon', gate.step === 0 ? '⏳' : '🔒'),
      gate.step === 0
        ? [h('h1', '곧 수업이 시작돼요'), h('p', '선생님이 첫 활동을 열면 자동으로 시작해요. 이 화면을 켜 둔 채로 기다려 주세요.')]
        : [h('h1', `${need.icon} ${need.label}은(는) 아직 잠겨 있어요`), h('p', '선생님이 열어 줄 때까지 기다려 주세요. 열리면 자동으로 바뀌어요.')],
      now && h('a.btn.btn-primary', { href: '#/' + now.view }, `지금 할 것: ${now.icon} ${now.label} →`),
      !gate.online && h('p.lock-offline', '⚠️ 서버와 연결이 잠시 끊겼어요. 인터넷 연결을 확인해 주세요.')));
  },
};

function buildSidebar() {
  const teamBtn = h('button.team', { title: '조 이름 바꾸기', onclick: renameTeam });
  const renderTeam = () => { teamBtn.replaceChildren(h('span.team-dot'), store.state.team); };
  renderTeam();
  store.subscribe(renderTeam);

  const oldStatus = h('div.status-line');
  kogpt2.subscribe((s) => {
    const label = {
      idle: '대기 중',
      loading: s.progress >= 1 ? '준비 중…' : `불러오는 중 ${Math.floor(s.progress * 100)}%`,
      ready: '준비됨',
      error: '불러오기 실패',
    }[s.status];
    oldStatus.replaceChildren(h('span.status-dot.' + s.status), `원리 체험 모델 · ${label}`);
  });

  const mode = currentMode();
  const modernStatus = mode === 'worker' ? null : h('div.status-line',
    h('span.status-dot.' + (mode === 'mock' ? 'idle' : 'ready')),
    mode === 'mock' ? 'GPT · 연습 모드(가짜 답변, 단계 잠금 없음)' : 'GPT · 개발 모드');

  stepsNav = h('nav.nav.steps');
  const toggle = h('button.nav-toggle', { 'aria-label': '메뉴', onclick: () => document.body.classList.toggle('nav-open') }, '☰');

  return h('aside.sidebar',
    toggle,
    h('div.brand', h('span.brand-icon', '⏳'), h('span', 'LLM 타임머신')),
    h('div.nav-title', '오늘의 순서'),
    stepsNav,
    h('div.nav-divider'),
    h('nav.nav',
      extraItem('dex', '🃏', '환각 도감'),
      extraItem('results', '🏆', '미션 결과')),
    h('div.sidebar-foot',
      oldStatus,
      modernStatus,
      isDev && h('button.link-btn', { onclick: devSettings }, '⚙ 개발 설정'),
      teamBtn,
      h('button.link-btn.danger', { onclick: resetAll }, '기록 초기화')));
}

function extraItem(view, icon, label) {
  return h('a.nav-item.extra', { href: '#/' + view, 'data-view': view }, h('span.nav-icon', icon), h('span.nav-text', h('span.nav-label', label)));
}

// "오늘의 순서" 목록: ✅ 끝난 단계, ▶ 지금 단계, 🔒 잠긴 단계
function renderSteps() {
  if (!stepsNav) return;
  const step = gate.step;
  const view = current?.name;
  // 같은 화면을 쓰는 단계가 여럿이면(리포트·공개) 열린 것 중 마지막을 강조
  const activeN = STEPS.filter((s) => s.view === view && s.n <= Math.max(step, 1)).pop()?.n;
  clear(stepsNav).append(...STEPS.map((s) => {
    const state = s.n < step ? 'done' : s.n === step ? 'now' : 'locked';
    const sub = typeof STEP_SUB[s.n] === 'function' ? STEP_SUB[s.n]() : STEP_SUB[s.n];
    return h('a.nav-item.step.' + state + (s.n === activeN && !current?.locked ? '.active' : ''), {
      href: '#/' + s.view,
      onclick: (e) => {
        if (state !== 'locked') return;
        e.preventDefault();
        toast(`🔒 ${s.label}은(는) 선생님이 열어 줄 때까지 기다려요`);
      },
    },
    h('span.step-num', state === 'done' ? '✓' : s.n),
    h('span.nav-text', h('span.nav-label', s.icon, ' ', s.label), h('span.nav-sub', sub)),
    state === 'now' && h('span.step-now', '지금'),
    state === 'locked' && h('span.step-lock', '🔒'));
  }));
  for (const a of document.querySelectorAll('.nav-item.extra')) a.classList.toggle('active', a.dataset.view === view);
}

async function renameTeam() {
  const team = await promptDialog('조 이름을 바꿀까요?', {
    value: store.state.team,
    validate: (v) => (v ? null : '조 이름을 입력해 주세요.'),
  });
  if (team) store.update((s) => { s.team = team; });
}

async function resetAll() {
  const ok = await confirmDialog('이 노트북의 모든 기록(미션, 채팅, 환각 도감, 리포트)을 지울까요?\n지운 기록은 되돌릴 수 없어요.', { ok: '모두 지우기', danger: true });
  if (!ok) return;
  current?.view.unmount?.();
  current = null;
  store.reset();
  route();
  toast('기록을 모두 지웠어요.');
}

async function devSettings() {
  const s = getDevSettings();
  const key = await promptDialog('개발 모드: OpenAI API 키 (이 브라우저에만 저장, 저장소에는 올라가지 않음)', { value: s.key, placeholder: 'sk-...' });
  if (key === null) return;
  setDevSettings({ key });
  toast('저장했어요. 새로고침하면 적용돼요.');
}
