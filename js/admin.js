// 🎛 관리자 패널: 수업 단계 열기/잠그기, 조별 현황, 새 수업 시작
// 비밀번호는 Worker 비밀값(ADMIN_PASSWORD)과 비교하고, 이 탭(sessionStorage)에만 기억한다.
import { h, clear, confirmDialog, promptDialog, toast } from './ui.js';
import { MODERN } from './config.js';
import { STEPS, GATE_CHANNEL } from './gate.js';

// 같은 브라우저에 열린 학생 화면에는 바로 알린다 (다른 노트북은 3초 안에 스스로 확인)
const notifyTabs = () => { try { new BroadcastChannel(GATE_CHANNEL).postMessage('changed'); } catch { /* 지원 안 함 */ } };

const KEY = 'llm-timemachine:admin';
const POLL_MS = 3000;
const VIEW_LABEL = { modern: '✨ 미션', principle: '🧩 원리 체험', past: '📼 과거 LLM', report: '⚖️ 리포트', dex: '🃏 환각 도감', results: '🏆 미션 결과' };
const STEP_NAMES = [{ n: 0, icon: '⏳', label: '대기 (전부 잠금)' }, ...STEPS];

const root = document.getElementById('admin');
let password = sessionStorage.getItem(KEY);
let data = null;
let timer = null;
let busy = false;

if (password) startPanel();
else showLogin();

async function call(action, extra = {}) {
  const res = await fetch(MODERN.workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ admin: { password, action, ...extra } }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || `오류 (${res.status})`), { status: res.status });
  return body;
}

function showLogin(message) {
  clearTimeout(timer);
  const input = h('input.input', { type: 'password', placeholder: '관리자 비밀번호', autocomplete: 'current-password' });
  const err = h('p.admin-error', message || '');
  const go = async () => {
    password = input.value.trim();
    if (!password) return;
    try {
      data = await call('get');
      sessionStorage.setItem(KEY, password);
      startPanel();
    } catch (e) {
      err.textContent = e.message;
      input.select();
    }
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
  clear(root).append(h('div.admin-login',
    h('div.card',
      h('div.big', '🎛'),
      h('h1', 'LLM 타임머신 관리자'),
      h('p.muted', '수업 단계를 열고, 조별 진행 상황을 확인하는 화면이에요.'),
      input, err,
      h('button.btn.btn-primary.btn-lg', { onclick: go }, '들어가기'))));
  input.focus();
}

function startPanel() {
  render();
  const tick = async () => {
    try {
      data = await call('get');
      render();
    } catch (e) {
      if (e.status === 401) { sessionStorage.removeItem(KEY); showLogin('비밀번호가 바뀌었어요. 다시 입력해 주세요.'); return; }
      render(true);
    }
    timer = setTimeout(tick, POLL_MS);
  };
  tick();
}

async function setStep(step) {
  if (busy || !data || step === data.step) return;
  if (step < data.step && !(await confirmDialog(`${stepName(step)}(으)로 되돌릴까요?\n${stepName(step + 1)}부터는 학생 화면이 다시 잠겨요.`, { ok: '되돌리기' }))) return;
  busy = true;
  try {
    data = await call('set', { step });
    notifyTabs();
    toast(step === 0 ? '모든 단계를 잠갔어요' : `${stepName(step)} 열림! 학생 화면에 몇 초 안에 반영돼요`);
  } catch (e) {
    toast('실패: ' + e.message);
  }
  busy = false;
  render();
}

async function newClass() {
  const typed = await promptDialog('새 수업을 시작하면 모든 단계가 잠기고,\n학생 노트북의 기록(조 이름 포함)이 모두 지워져요.\n계속하려면 "새 수업"이라고 입력하세요.', {
    placeholder: '새 수업', ok: '새 수업 시작', validate: (v) => (v === '새 수업' ? null : '"새 수업"이라고 정확히 입력해 주세요.'),
  });
  if (typed === null) return;
  busy = true;
  try {
    data = await call('reset');
    notifyTabs();
    toast('새 수업을 시작했어요. 학생 노트북이 처음 화면으로 돌아가요.');
  } catch (e) {
    toast('실패: ' + e.message);
  }
  busy = false;
  render();
}

const stepName = (n) => { const s = STEP_NAMES.find((x) => x.n === n); return s ? `${s.icon} ${s.label}` : `${n}단계`; };

function render(offline = false) {
  if (!data) {
    clear(root).append(h('div.admin-wrap', h('p.muted', '불러오는 중…')));
    return;
  }
  const step = data.step;
  const next = STEP_NAMES.find((s) => s.n === step + 1);
  const online = data.teams.filter((t) => t.online).length;

  clear(root).append(h('div.admin-wrap',
    h('header.admin-head',
      h('div', h('h1', '🎛 LLM 타임머신 관리자'), h('p.muted', `수업 id ${data.session} · 단계를 열면 학생 화면이 3초 안에 그 활동으로 넘어가요`)),
      h('button.link-btn.admin-logout', { onclick: () => { sessionStorage.removeItem(KEY); password = null; showLogin(); } }, '나가기')),
    offline && h('div.card.admin-offline', '⚠️ 서버와 연결이 잠시 끊겼어요. 다시 연결을 시도하는 중이에요.'),

    h('section.card.admin-now',
      h('div.now-label', '지금 열린 단계'),
      h('div.now-step', stepName(step)),
      next
        ? h('button.btn.btn-primary.next-btn', { onclick: () => setStep(next.n), disabled: busy }, `▶ 다음 단계 열기: ${next.icon} ${next.label}`)
        : h('p.muted', '모든 단계가 열렸어요. 수업 마무리(정리와 토론)를 진행하세요.')),

    h('section.card',
      h('h2', '단계 직접 고르기'),
      h('p.muted', '눌러서 그 단계까지 열어요. 앞 단계로 되돌리면 뒤 단계는 다시 잠겨요.'),
      h('div.step-chips', STEP_NAMES.map((s) => h('button.step-chip' + (s.n === step ? '.now' : s.n < step ? '.open' : ''), { onclick: () => setStep(s.n), disabled: busy },
        h('b', s.n), ` ${s.icon} ${s.label}`)))),

    h('section.card',
      h('h2', `조별 현황 · 접속 ${online} / ${data.teams.length}조`),
      data.teams.length
        ? h('table.teams',
          h('thead', h('tr', h('th', '조'), h('th', '접속'), h('th', '보고 있는 화면'), h('th', '미션 성공 / 전체'), h('th', '점수 현대 · 과거'), h('th', '리포트'))),
          h('tbody', data.teams.map((t) => {
            const s = t.summary || {};
            return h('tr' + (t.online ? '' : '.away'),
              h('td.team-name', t.name),
              h('td', h('span.dot' + (t.online ? '.on' : '')), t.online ? '접속 중' : `${Math.round(t.ago / 1000)}초 전`),
              h('td', VIEW_LABEL[t.view] ?? t.view ?? '-'),
              h('td', `${s.wins ?? 0} / ${s.missions ?? 0}`),
              h('td', `${s.modern ?? 0} · ${s.past ?? 0}점`),
              h('td', s.report ? `${s.report}개 비교` : '-'));
          })))
        : h('p.muted', '아직 접속한 조가 없어요. 학생들이 사이트를 열고 조 이름을 입력하면 여기에 나타나요.')),

    h('section.card.admin-danger',
      h('h2', '새 수업'),
      h('p.muted', '리허설이 끝났거나 다른 반 수업을 시작할 때 눌러요. 모든 노트북의 기록이 지워져요.'),
      h('button.btn.btn-danger', { onclick: newClass, disabled: busy }, '🔄 새 수업 시작'))));
}
