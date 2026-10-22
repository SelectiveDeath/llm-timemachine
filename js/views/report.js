// ⚖️ 오늘의 타임머신 리포트 (활동 4)
// 오늘 던진 질문을 모아, 비어 있는 쪽 모델에도 똑같이 물어보고 나란히 비교한다.
//  - 미션에서 현대 LLM에게 했던 질문 → 과거 LLM(gpt-3.5-turbo)에게도
//  - 과거 LLM에게 했던 질문 → 현대 LLM(gpt-5.4)에게도
// 선생님이 관리자 패널에서 마지막 단계(🚀 최신 모델 공개)를 열면 같은 질문을 최신 모델(gpt-6-sol)에게도 물어 세 번째 칸에 보여 준다.
import { store, uid, getMissionStats, missionMessages, questionBefore } from '../store.js';
import { h, add, clear, markdown, confirmDialog, toast, short } from '../ui.js';
import { chat, ChatError } from '../modern-llm.js';
import { REPORT_MAX_ITEMS, MODELS } from '../config.js';
import { gate, REVEAL_STEP } from '../gate.js';

const SOURCE_LABEL = { round1: '현대 LLM 미션', past: '과거 LLM 미션' };
const PAST_LABEL = `📼 ${MODELS.past.id} · ${MODELS.past.year}`;
const MODERN_LABEL = `✨ ${MODELS.modern.id} · ${MODELS.modern.year}`;
const LATEST_LABEL = `🚀 ${MODELS.latest.id} · 최신`;

let host = null; // 화면에 붙어 있을 때만 다시 그린다
let unsubGate = null;
let running = false;
let progress = { done: 0, total: 0 };

export function mount(el) {
  host = el;
  render();
  continueWork();
  // 최신 모델 공개 단계가 열리면 바로 묻기 시작
  unsubGate = gate.subscribe(() => {
    render();
    continueWork();
  });
}

// 만들다가 새로고침했거나 다른 화면에 갔다 오면 이어서 진행.
// 리포트를 안 만든 채로 최신 모델 공개 단계가 열리면 자동으로 만든다 (세 칸 모두 채움)
function continueWork() {
  if (running) return;
  if (revealed() && !items().length && candidates().length) build({ ask: false });
  else if (pendingItems().length) run();
}

export function unmount() {
  host = null; // 진행 중인 작업은 백그라운드에서 계속되고 기록에 저장된다
  unsubGate?.();
}

const items = () => store.state.report.items;
const revealed = () => gate.step >= REVEAL_STEP;
const needs = (it) => ({
  past: it.oldAnswer == null && !it.oldError,
  modern: it.modernAnswer == null && !it.modernError,
  latest: revealed() && it.latestAnswer == null && !it.latestError,
});
const pendingItems = () => items().filter((it) => Object.values(needs(it)).some(Boolean));

// ── 후보 모으기 ─────────────────────────────

function candidates() {
  const out = [];
  // 미션마다: 성공했으면 속은 답과 그 질문, 아니면 마지막 질문과 답
  for (const m of [...store.state.modern.missions, ...store.state.past.missions]) {
    if (m.status === 'cancel') continue;
    const msgs = missionMessages(m).filter((x) => !x.error && !x.pending);
    const ai = (m.winMsgId && msgs.find((x) => x.id === m.winMsgId)) || msgs.filter((x) => x.role === 'assistant').pop();
    if (!ai) continue;
    const q = questionBefore(msgs, msgs.indexOf(ai));
    if (!q) continue;
    // 그 답이 나오기까지 학생이 보낸 질문을 모두 이어 붙인다 (마지막 질문만 보내면 "그 책" 같은 말을 이해 못 함)
    const question = msgs.slice(0, msgs.indexOf(q) + 1).filter((x) => x.role === 'user').map((x) => x.content).join('\n');
    const isPast = m.bucket === 'past';
    out.push({
      ref: 'm:' + m.id, source: isPast ? 'past' : 'round1', question, mission: m.title,
      oldAnswer: isPast ? ai.content : null, modernAnswer: isPast ? null : ai.content,
      side: isPast ? 'old' : 'new', success: m.status === 'success',
      // 현대 LLM은 안 속었는데 과거 LLM은 속은 미션이 가장 인상적인 비교
      best: isPast && m.status === 'success' && m.modernResult === 'fail',
      priority: (isPast && m.status === 'success' ? (m.modernResult === 'fail' ? 5 : 3) : m.status === 'success' ? 3 : 1) + m.ts / 1e15,
    });
  }
  // 같은 질문이 여러 번 있으면 우선순위가 높은 하나만
  const seen = new Set();
  return out.sort((a, b) => b.priority - a.priority).filter((c) => {
    const key = c.question.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function toItem(c, prev) {
  return {
    id: prev?.id ?? uid(), ref: c.ref, source: c.source, question: c.question, mission: c.mission ?? null,
    oldAnswer: prev?.oldAnswer ?? c.oldAnswer, modernAnswer: prev?.modernAnswer ?? c.modernAnswer, latestAnswer: prev?.latestAnswer ?? null,
    side: c.side, success: c.success, best: c.best,
    memo: prev?.memo ?? '', present: prev?.present ?? false, oldError: null, modernError: null, latestError: null,
  };
}

async function build({ ask = true } = {}) {
  if (running) return;
  const cands = candidates();
  if (!cands.length) return;
  if (ask && items().length && !(await confirmDialog('리포트를 다시 만들까요?\n이미 받은 답과 메모는 그대로 남아요.', { ok: '다시 만들기' }))) return;
  const prev = new Map(items().map((it) => [it.ref, it]));
  store.update((s) => {
    s.report.items = cands.slice(0, REPORT_MAX_ITEMS).map((c) => toItem(c, prev.get(c.ref)));
    s.report.generatedAt = Date.now();
  });
  render();
  run();
}

function addItem(c) {
  store.update((s) => { s.report.items.push(toItem(c)); });
  render();
  if (!running) run();
}

// ── 빈 쪽 답 받아오기 ────────────────────────

async function run() {
  running = true;
  const todo = pendingItems();
  progress = { done: 0, total: todo.length };
  render();
  for (const it of todo) {
    const n = needs(it);
    await Promise.all([n.past && fill(it.id, 'past'), n.modern && fill(it.id, 'modern'), n.latest && fill(it.id, 'latest')]);
    progress.done++;
    render();
  }
  running = false;
  render();
  if (host && todo.length) toast('📊 리포트 완성!');
}

const patch = (id, p) => store.update((s) => {
  const it = s.report.items.find((x) => x.id === id);
  if (it) Object.assign(it, p);
}, { silent: true });

// 학생이 보낸 질문들을 이어 붙인 것을 한 번에 보낸다
async function fill(id, era) {
  const it = items().find((x) => x.id === id);
  if (!it) return;
  const [answerKey, errorKey] = { past: ['oldAnswer', 'oldError'], modern: ['modernAnswer', 'modernError'], latest: ['latestAnswer', 'latestError'] }[era];
  try {
    const answer = await chat([{ role: 'user', content: it.question }], { era });
    patch(id, { [answerKey]: answer || '(빈 답변)', [errorKey]: null });
  } catch (e) {
    patch(id, { [errorKey]: e instanceof ChatError ? e.message : '답을 받지 못했어요.' });
  }
}

function retry(id) {
  patch(id, { oldError: null, modernError: null, latestError: null });
  render();
  if (!running) run();
}

// ── 그리기 ─────────────────────────────────

function render() {
  if (!host) return;
  const scrollTop = host.scrollTop;
  // 진행 중에 다시 그려도 메모를 쓰던 칸의 커서가 유지되도록
  const active = document.activeElement?.classList.contains('cmp-memo') ? document.activeElement : null;
  const focus = active && { id: active.dataset.id, start: active.selectionStart, end: active.selectionEnd };
  clear(host);
  const list = items();
  const page = h('div.page.report',
    h('div.page-head.report-head',
      h('div', h('h1', `📊 ${store.state.team}의 타임머신 리포트`),
        h('p', `오늘 던진 질문을 ${MODELS.past.id}(${MODELS.past.year})와 ${MODELS.modern.id}(${MODELS.modern.year})에게 똑같이 물어본 결과`)),
      list.length > 0 && h('div.report-actions',
        h('button.btn', { onclick: () => build(), disabled: running }, '↻ 다시 만들기'),
        h('button.btn.btn-primary', { onclick: present }, '🖥 발표 모드'))));

  if (!list.length) page.append(intro());
  else {
    if (revealed()) page.append(h('div.card.reveal-banner', '🚀 ', h('b', `최신 모델 ${MODELS.latest.id}`), '에게도 똑같이 물어봤어요. 오른쪽 칸을 비교해 보세요. 원리는 여전히 "다음 말 예측"이에요!'));
    if (running) page.append(h('div.card.report-progress',
      h('div.rp-text', `모델들에게 묻는 중... ${progress.done} / ${progress.total}`),
      h('div.rp-bar', h('div.rp-fill', { style: { width: (progress.total ? progress.done / progress.total : 0) * 100 + '%' } }))));
    add(page, summary(), h('div.cmp-list', list.map(compareCard)), moreList());
  }
  host.append(page);
  host.scrollTop = scrollTop;
  if (focus) {
    const el = host.querySelector(`.cmp-memo[data-id="${focus.id}"]`);
    el?.focus();
    el?.setSelectionRange(focus.start, focus.end);
  }
}

function intro() {
  const cands = candidates();
  const fromMissions = cands.filter((c) => c.source !== 'past').length; // 현대 LLM 미션에서 나온 질문
  return h('div.card.report-intro',
    h('div.big', '⚖️'),
    h('h2', '오늘의 질문으로 리포트를 만들어요'),
    h('p', '미션에서 현대 LLM에게 한 질문 ', h('b', fromMissions), '개, 과거 LLM에게 한 질문 ', h('b', cands.length - fromMissions), '개가 있어요.'),
    h('p', `성공한 미션과 관찰 표시를 한 질문을 우선으로 최대 ${REPORT_MAX_ITEMS}개를 골라, 반대쪽 모델에게도 똑같이 물어봐요.`),
    h('button.btn.btn-primary.btn-lg', { onclick: () => build(), disabled: !cands.length }, '📊 리포트 만들기'),
    !cands.length && h('p.muted', '먼저 ✨ 현대 LLM 미션이나 📼 과거 LLM에서 질문을 해 보세요.'));
}

function summary() {
  const s = store.state;
  const asked = s.modern.messages.filter((m) => m.role === 'user').length + s.past.messages.filter((m) => m.role === 'user').length;
  const { modern, past } = getMissionStats();
  return h('div.summary',
    h('div.sum-card', h('span.sum-label', '던진 질문'), h('b.sum-num', asked), h('span.sum-sub', '개')),
    h('div.sum-card.new', h('span.sum-label', `✨ ${MODELS.modern.id}`), h('b.sum-num', `${modern.points}점`), h('span.sum-sub', `미션 ${modern.played}개 중 ${modern.success}개 속음`)),
    h('div.sum-card.old', h('span.sum-label', `📼 ${MODELS.past.id} (같은 미션)`), h('b.sum-num', `${past.points}점`), h('span.sum-sub', `미션 ${past.played}개 중 ${past.success}개 속음`)));
}

function compareCard(it) {
  const toggle = h('input', { type: 'checkbox', checked: it.present, onchange: (e) => patch(it.id, { present: e.target.checked }) });
  const memo = h('textarea.cmp-memo', {
    'data-id': it.id, rows: 2, placeholder: '차이 메모: 무엇이 달랐나요? 왜 그렇게 달라졌을까요?',
    value: it.memo, oninput: (e) => patch(it.id, { memo: e.target.value }),
  });
  const remove = async () => {
    if (!(await confirmDialog('이 질문을 리포트에서 뺄까요?', { ok: '빼기' }))) return;
    store.update((s) => { s.report.items = s.report.items.filter((x) => x.id !== it.id); });
    render();
  };
  return h('article.cmp' + (it.best ? '.best' : '') + (revealed() ? '.three' : ''),
    h('div.cmp-q',
      h('span.tag.blue', SOURCE_LABEL[it.source]),
      it.mission && h('span.tag', '🎯 ', it.mission),
      h('b.cmp-question', 'Q. ', it.question),
      h('label.cmp-present', toggle, ' 발표 후보'),
      h('button.cmp-remove', { onclick: remove, title: '리포트에서 빼기' }, '×')),
    h('div.cmp-grid',
      h('div.cmp-old',
        h('div.cmp-label', PAST_LABEL),
        sideBody(it.oldAnswer, it.oldError, it.id),
        it.side === 'old' && resultTag(it.success)),
      h('div.cmp-new',
        h('div.cmp-label', MODERN_LABEL),
        sideBody(it.modernAnswer, it.modernError, it.id),
        it.side === 'new' && resultTag(it.success)),
      revealed() && h('div.cmp-latest', h('div.cmp-label', LATEST_LABEL), sideBody(it.latestAnswer, it.latestError, it.id))),
    memo);
}

const resultTag = (success) => h('div.cmp-tags', h('span.tag' + (success ? '.old' : '.new'), success ? '😈 미션에서 속았다' : '🤖 미션에서 안 속았다'));

function sideBody(answer, error, id) {
  if (error) return h('div.cmp-error', '⚠️ ', error, ' ', h('button.btn.btn-sm', { onclick: () => retry(id) }, '다시 시도'));
  if (answer == null) return h('div.cmp-wait', h('span.typing', h('i'), h('i'), h('i')), ' 묻는 중...');
  return h('div.cmp-text.md', { html: markdown(answer) });
}

function moreList() {
  const used = new Set(items().map((it) => it.ref));
  const rest = candidates().filter((c) => !used.has(c.ref) && !items().some((it) => it.question.trim() === c.question.trim()));
  if (!rest.length) return null;
  return h('details.card.more',
    h('summary', `리포트에 더 넣을 수 있는 질문 ${rest.length}개`),
    h('ul', rest.map((c) => h('li',
      h('span.tag.blue', SOURCE_LABEL[c.source]), ' ', short(c.question, 80), ' ',
      h('button.btn.btn-sm', { onclick: () => addItem(c), disabled: running }, '+ 넣기')))));
}

// ── 발표 모드 ──────────────────────────────

function present() {
  const chosen = items().filter((it) => it.present);
  const slides = chosen.length ? chosen : items();
  if (!slides.length) return;
  let i = 0;
  const stage = h('div.present-stage');
  const counter = h('span.present-count');
  const overlay = h('div.present',
    h('div.present-bar',
      h('span', `📊 ${store.state.team}의 타임머신 리포트`),
      counter,
      h('button.present-close', { onclick: close, title: '닫기 (Esc)' }, '✕')),
    stage,
    h('div.present-nav',
      h('button.btn', { onclick: () => go(-1) }, '← 이전'),
      h('button.btn', { onclick: () => go(1) }, '다음 →')));

  function show() {
    const it = slides[i];
    counter.textContent = `${i + 1} / ${slides.length}`;
    add(clear(stage),
      h('div.present-q', h('span.tag.blue', SOURCE_LABEL[it.source]), h('h2', it.question)),
      h('div.present-grid' + (revealed() ? '.three' : ''),
        h('div.cmp-old', h('div.cmp-label', PAST_LABEL), h('div.cmp-text.md', { html: markdown(it.oldAnswer ?? '…') })),
        h('div.cmp-new', h('div.cmp-label', MODERN_LABEL), h('div.cmp-text.md', { html: markdown(it.modernAnswer ?? '…') })),
        revealed() && h('div.cmp-latest', h('div.cmp-label', LATEST_LABEL), h('div.cmp-text.md', { html: markdown(it.latestAnswer ?? '…') }))),
      it.memo && h('div.present-memo', '💬 ', it.memo));
  }
  function go(d) { i = (i + d + slides.length) % slides.length; show(); }
  function key(e) {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'Escape') close();
  }
  function close() {
    document.removeEventListener('keydown', key);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    overlay.remove();
  }
  document.addEventListener('keydown', key);
  document.body.append(overlay);
  overlay.requestFullscreen?.().catch(() => {});
  show();
}
