// 앱 시작점: 조 이름 입력, 사이드바, 화면 전환
import { store } from './store.js';
import { h, clear, confirmDialog, promptDialog, toast } from './ui.js';
import { oldLLM } from './old-llm.js';
import { currentMode, isDev, getDevSettings, setDevSettings } from './modern-llm.js';
import * as modernView from './views/modern.js';
import * as retroView from './views/retro.js';
import * as reportView from './views/report.js';
import * as dexView from './views/dex.js';
import * as roundsView from './views/rounds.js';

const VIEWS = {
  modern: { icon: '✨', label: '2026 채팅', sub: '현대 LLM', view: modernView },
  retro: { icon: '📼', label: '과거 LLM', sub: 'KoGPT2', view: retroView },
  report: { icon: '⚖️', label: '비교 리포트', sub: '과거 vs 현대', view: reportView },
  dex: { icon: '🃏', label: '환각 도감', view: dexView, secondary: true },
  rounds: { icon: '🏆', label: '라운드 결과', view: roundsView, secondary: true },
};

const app = document.getElementById('app');
let current = null; // { name, view }
let main;

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
  const sidebar = buildSidebar();
  clear(app).append(h('div.layout', sidebar, main));
  window.addEventListener('hashchange', route);
  route();

  // 과거 LLM 모델은 미리 받아 둔다 (활동 2 전에 다운로드가 끝나 있도록)
  oldLLM.load().catch(() => {});
}

function route() {
  let name = location.hash.replace(/^#\/?/, '');
  if (!VIEWS[name]) {
    name = VIEWS[store.state.view] ? store.state.view : 'modern';
    history.replaceState(null, '', '#/' + name);
  }
  if (current?.name === name) return;
  current?.view.unmount?.();
  store.update((s) => { s.view = name; }, { silent: true });
  clear(main);
  main.className = 'main view-' + name;
  current = { name, view: VIEWS[name].view };
  current.view.mount(main);
  for (const a of document.querySelectorAll('.nav-item')) a.classList.toggle('active', a.dataset.view === name);
  document.body.classList.remove('nav-open');
}

function buildSidebar() {
  const navItem = (name) => {
    const v = VIEWS[name];
    return h('a.nav-item', { href: '#/' + name, 'data-view': name },
      h('span.nav-icon', v.icon),
      h('span.nav-text', h('span.nav-label', v.label), v.sub && h('span.nav-sub', v.sub)));
  };

  const teamBtn = h('button.team', { title: '조 이름 바꾸기', onclick: renameTeam });
  const renderTeam = () => { teamBtn.replaceChildren(h('span.team-dot'), store.state.team); };
  renderTeam();
  store.subscribe(renderTeam);

  const oldStatus = h('div.status-line');
  oldLLM.subscribe((s) => {
    const label = {
      idle: '대기 중',
      loading: s.progress >= 1 ? '준비 중…' : `불러오는 중 ${Math.floor(s.progress * 100)}%`,
      ready: '준비됨',
      error: '불러오기 실패',
    }[s.status];
    oldStatus.replaceChildren(h('span.status-dot.' + s.status), `과거 LLM · ${label}`);
  });

  const mode = currentMode();
  const modernStatus = mode === 'worker' ? null : h('div.status-line',
    h('span.status-dot.' + (mode === 'mock' ? 'idle' : 'ready')),
    mode === 'mock' ? '현대 LLM · 연습 모드(가짜 답변)' : '현대 LLM · 개발 모드');

  const toggle = h('button.nav-toggle', { 'aria-label': '메뉴', onclick: () => document.body.classList.toggle('nav-open') }, '☰');

  return h('aside.sidebar',
    toggle,
    h('div.brand', h('span.brand-icon', '⏳'), h('span', 'LLM 타임머신')),
    h('nav.nav',
      ['modern', 'retro', 'report'].map(navItem),
      h('div.nav-divider'),
      ['dex', 'rounds'].map(navItem)),
    h('div.sidebar-foot',
      oldStatus,
      modernStatus,
      isDev && h('button.link-btn', { onclick: devSettings }, '⚙ 개발 설정'),
      teamBtn,
      h('button.link-btn.danger', { onclick: resetAll }, '기록 초기화')));
}

async function renameTeam() {
  const team = await promptDialog('조 이름을 바꿀까요?', {
    value: store.state.team,
    validate: (v) => (v ? null : '조 이름을 입력해 주세요.'),
  });
  if (team) store.update((s) => { s.team = team; });
}

async function resetAll() {
  const ok = await confirmDialog('이 노트북의 모든 기록(채팅, 점수, 환각 도감, 리포트)을 지울까요?\n지운 기록은 되돌릴 수 없어요.', { ok: '모두 지우기', danger: true });
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
  const model = await promptDialog('개발 모드: 모델 이름', { value: s.model, placeholder: '예: 모델 ID' });
  if (model === null) return;
  setDevSettings({ key, model });
  toast('저장했어요. 새로고침하면 적용돼요.');
}
