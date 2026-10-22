// ⚖️ 오늘의 타임머신 리포트 (활동 4)
// 활동 1~3에서 던진 질문을 모아, 비어 있는 쪽 모델에도 자동으로 물어보고 나란히 비교한다.
//  - 현대 LLM에게 했던 질문 → 과거 LLM(KoGPT2)에게도
//  - 과거 LLM에게 했던 질문 → 현대 LLM에게도
import { store, uid, getAttempts, getRoundStats } from '../store.js';
import { h, add, clear, markdown, confirmDialog, toast, short } from '../ui.js';
import { oldLLM } from '../old-llm.js';
import { chat, ChatError } from '../modern-llm.js';
import { REPORT_MAX_ITEMS } from '../config.js';
import { askPrompt, ASK_OPTS } from './retro.js';

const SOURCE_LABEL = { round1: '속이기 1라운드', round2: '속이기 2라운드', retro: '과거 LLM 질문' };
const VERDICT_LABEL = { fooled: '😈 속았다', unknown: '🙋 모른다고 함', correct: '✅ 정확함' };
const TAG_LABEL = { pretend: '아는 척 ⭐', changes: '매번 바뀜 🔄', offtopic: '딴소리 💬' };

let host = null; // 화면에 붙어 있을 때만 다시 그린다
let running = false;
let progress = { done: 0, total: 0 };

export function mount(el) {
  host = el;
  render();
  // 만들다가 새로고침했거나 다른 화면에 갔다 오면 이어서 진행
  if (!running && pendingItems().length) run();
}

export function unmount() {
  host = null; // 진행 중인 작업은 백그라운드에서 계속되고 기록에 저장된다
}

const items = () => store.state.report.items;
const pendingItems = () => items().filter((it) => (it.oldAnswer == null && !it.oldError) || (it.modernAnswer == null && !it.modernError));

// ── 후보 모으기 ─────────────────────────────

function candidates() {
  const out = [];
  getAttempts().forEach((a, i) => {
    if (!a.question.trim()) return;
    out.push({
      ref: 'm:' + a.id, source: a.round === 2 ? 'round2' : 'round1', question: a.question,
      oldAnswer: null, modernAnswer: a.answer, verdict: a.verdict, tags: [],
      priority: (a.verdict === 'fooled' ? 3 : a.verdict ? 2 : 0) + i / 1e6,
    });
  });
  store.state.retro.questions.forEach((q) => {
    if (!q.answers.length) return;
    out.push({
      ref: 'r:' + q.id, source: 'retro', question: q.question,
      oldAnswer: q.answers[0], modernAnswer: null, verdict: null, tags: q.tags, kind: q.kind, best: q.best,
      priority: (q.best ? 5 : q.tags.length ? 3 : 1) + q.ts / 1e15,
    });
  });
  // 같은 질문이 여러 번 있으면 하나만
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
    id: prev?.id ?? uid(), ref: c.ref, source: c.source, question: c.question,
    oldAnswer: prev?.oldAnswer ?? c.oldAnswer, modernAnswer: prev?.modernAnswer ?? c.modernAnswer,
    verdict: c.verdict, tags: c.tags, kind: c.kind ?? null, best: !!c.best,
    memo: prev?.memo ?? '', present: prev?.present ?? false, oldError: null, modernError: null,
  };
}

async function build() {
  if (running) return;
  const cands = candidates();
  if (!cands.length) return;
  if (items().length && !(await confirmDialog('리포트를 다시 만들까요?\n이미 받은 답과 메모는 그대로 남아요.', { ok: '다시 만들기' }))) return;
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
    await Promise.all([
      it.oldAnswer == null && !it.oldError ? fillOld(it.id) : null,
      it.modernAnswer == null && !it.modernError ? fillModern(it.id) : null,
    ]);
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

async function fillOld(id) {
  const it = items().find((x) => x.id === id);
  if (!it) return;
  try {
    const r = await oldLLM.generate(askPrompt(it.question), ASK_OPTS);
    patch(id, { oldAnswer: r.text.trim() || '(아무 말도 하지 않음)', oldError: null });
  } catch (e) {
    patch(id, { oldError: '과거 LLM을 불러오지 못했어요.' });
  }
}

async function fillModern(id) {
  const it = items().find((x) => x.id === id);
  if (!it) return;
  try {
    const answer = await chat([{ role: 'user', content: it.question }]);
    patch(id, { modernAnswer: answer || '(빈 답변)', modernError: null });
  } catch (e) {
    patch(id, { modernError: e instanceof ChatError ? e.message : '현대 LLM 답을 받지 못했어요.' });
  }
}

function retry(id) {
  patch(id, { oldError: null, modernError: null });
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
      h('div', h('h1', `📊 ${store.state.team}의 타임머신 리포트`), h('p', '오늘 던진 질문을 과거 LLM과 현대 LLM에 똑같이 물어본 결과')),
      list.length > 0 && h('div.report-actions',
        h('button.btn', { onclick: build, disabled: running }, '↻ 다시 만들기'),
        h('button.btn.btn-primary', { onclick: present }, '🖥 발표 모드'))));

  if (!list.length) page.append(intro());
  else {
    if (running) page.append(h('div.card.report-progress',
      h('div.rp-text', `과거 LLM과 현대 LLM에게 묻는 중... ${progress.done} / ${progress.total}`),
      h('div.rp-bar', h('div.rp-fill', { style: { width: (progress.total ? progress.done / progress.total : 0) * 100 + '%' } })),
      h('small', '과거 LLM은 이 노트북에서 직접 돌아가서 질문 하나에 몇 초씩 걸려요.')));
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
  const fromModern = cands.filter((c) => c.source !== 'retro').length;
  const fromRetro = cands.length - fromModern;
  return h('div.card.report-intro',
    h('div.big', '⚖️'),
    h('h2', '오늘의 질문으로 리포트를 만들어요'),
    h('p', '속이기 라운드에서 현대 LLM에게 한 질문 ', h('b', fromModern), '개, 과거 LLM에게 한 질문 ', h('b', fromRetro), '개가 있어요.'),
    h('p', `이 중 판정하거나 관찰 표시를 한 질문을 우선으로 최대 ${REPORT_MAX_ITEMS}개를 골라, 반대쪽 모델에게도 똑같이 물어봐요.`),
    h('button.btn.btn-primary.btn-lg', { onclick: build, disabled: !cands.length }, '📊 리포트 만들기'),
    !cands.length && h('p.muted', '먼저 ✨ 2026 채팅이나 📼 과거 LLM에서 질문을 해 보세요.'));
}

function summary() {
  const s = store.state;
  const asked = s.modern.messages.filter((m) => m.role === 'user').length + s.retro.questions.length;
  const answered = s.retro.questions.filter((q) => q.answers.length);
  const pretend = answered.filter((q) => q.tags.includes('pretend')).length;
  const [r1, r2] = getRoundStats();
  const best = s.retro.questions.find((q) => q.best);
  return h('div.summary',
    h('div.sum-card', h('span.sum-label', '던진 질문'), h('b.sum-num', asked), h('span.sum-sub', '개')),
    h('div.sum-card.old', h('span.sum-label', '📼 과거 LLM 환각'), h('b.sum-num', pretend), h('span.sum-sub', `/ ${answered.length} 질문에서 "아는 척"`)),
    h('div.sum-card.new', h('span.sum-label', '✨ 현대 LLM 속은 횟수'),
      h('b.sum-num', `${r1.fooled} → ${r2.fooled}`), h('span.sum-sub', `1라운드 ${r1.tries}번 중 → 2라운드 ${r2.tries}번 중`)),
    best && h('div.sum-card.best', h('span.sum-label', '🏆 가장 그럴듯한 거짓말'),
      h('b.sum-quote', `“${short(best.answers[0], 70)}”`), h('span.sum-sub', 'Q. ' + short(best.question, 40))));
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
  return h('article.cmp' + (it.best ? '.best' : ''),
    h('div.cmp-q',
      h('span.tag.blue', SOURCE_LABEL[it.source]),
      it.kind === 'fake' && h('span.tag.danger', '지어낸 질문'),
      h('b.cmp-question', 'Q. ', it.question),
      h('label.cmp-present', toggle, ' 발표 후보'),
      h('button.cmp-remove', { onclick: remove, title: '리포트에서 빼기' }, '×')),
    h('div.cmp-grid',
      h('div.cmp-old',
        h('div.cmp-label', '📼 KoGPT2 · 과거'),
        sideBody(it.oldAnswer, it.oldError, it.id, false),
        it.tags.length > 0 && h('div.cmp-tags', it.tags.map((t) => h('span.tag.old', TAG_LABEL[t])))),
      h('div.cmp-new',
        h('div.cmp-label', '✨ GPT · 2026'),
        sideBody(it.modernAnswer, it.modernError, it.id, true),
        it.verdict && h('div.cmp-tags', h('span.tag' + (it.verdict === 'fooled' ? '.old' : '.new'), '판정: ', VERDICT_LABEL[it.verdict])))),
    memo);
}

function sideBody(answer, error, id, isModern) {
  if (error) return h('div.cmp-error', '⚠️ ', error, ' ', h('button.btn.btn-sm', { onclick: () => retry(id) }, '다시 시도'));
  if (answer == null) return h('div.cmp-wait', h('span.typing', h('i'), h('i'), h('i')), ' 묻는 중...');
  if (isModern) return h('div.cmp-text.md', { html: markdown(answer) });
  return h('div.cmp-text', answer);
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
      h('div.present-grid',
        h('div.cmp-old', h('div.cmp-label', '📼 KoGPT2 · 과거'), h('div.cmp-text', it.oldAnswer ?? '…')),
        h('div.cmp-new', h('div.cmp-label', '✨ GPT · 2026'), h('div.cmp-text.md', { html: markdown(it.modernAnswer ?? '…') }))),
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
