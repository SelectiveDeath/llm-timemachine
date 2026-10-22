// ✨ 2026 화면: 현대 LLM 속이기 1라운드(활동 1), 2라운드(활동 3)
import { store, uid, getScore } from '../store.js';
import { h, add, clear, markdown, promptDialog, toast, autoGrow } from '../ui.js';
import { chat, judge, ChatError } from '../modern-llm.js';
import { ROUND2_CODE } from '../config.js';
import { countText, calc, factsFor } from '../checker.js';

const VERDICTS = [
  { key: 'fooled', label: '😈 속았다', point: '우리 +1' },
  { key: 'unknown', label: '🙋 모른다고 함', point: 'AI +1' },
  { key: 'correct', label: '✅ 정확함', point: 'AI +1' },
];

const STRATEGIES = [
  {
    icon: '🧩', title: '토큰의 함정', principle: 'LLM은 글자가 아니라 토큰(조각) 단위로 읽어요.',
    tip: '글자 수 세기, 특정 글자가 몇 번 나오는지, 단어를 거꾸로 쓰기처럼 "글자 하나하나"를 봐야 하는 문제를 내 보세요.',
  },
  {
    icon: '🎲', title: '그럴듯함의 함정', principle: 'LLM은 사실이 아니라 "그럴듯한 다음 말"을 골라요.',
    tip: '틀린 내용을 사실처럼 깔고 질문해 보세요. 예: "세종대왕이 맥북을 던진 사건에 대해 알려줘"',
  },
  {
    icon: '📅', title: '시간의 함정', principle: 'LLM은 학습한 시점 이후의 일은 몰라요.',
    tip: '아주 최근에 일어난 일이나, 인터넷에 없는 우리 학교 행사를 물어보세요.',
  },
  {
    icon: '🔁', title: '확률의 함정', principle: 'LLM은 확률로 고르기 때문에 매번 다르게 답할 수 있어요.',
    tip: '같은 질문을 "새 대화"에서 여러 번 해 보고, 답이 흔들리는지 확인해 보세요.',
  },
];

let root, bodyEl, listEl, composer, input, sendBtn, scoreEl, panelEl;
let controller = null; // 답변 중이면 AbortController
let unsub;
const judging = new Set(); // AI 심판이 판정 중인 메시지 id

export function mount(el) {
  // 새로고침 등으로 끊긴 답변 정리
  store.update((s) => {
    for (const m of s.modern.messages) {
      if (m.pending) { m.pending = false; if (!m.content) { m.error = true; m.content = '답변이 중간에 끊겼어요. 다시 보내 주세요.'; } }
    }
  }, { silent: true });

  root = h('div.chat');
  el.append(root);
  render();
  unsub = store.subscribe(() => renderTop());
  // 새로고침 등으로 판정을 못 받은 답은 다시 판정
  judgeMissing();
}

async function judgeMissing() {
  for (const m of currentMessages()) {
    if (m.role === 'assistant' && !m.error && !m.pending && !m.judge && !m.judgeError) await runJudge(m.id);
  }
}

export function unmount() {
  controller?.abort();
  unsub?.();
}

const s = () => store.state;
const currentMessages = () => s().modern.messages.filter((m) => m.conv === s().modern.conv);

function render() {
  clear(root);
  const round = s().round;
  root.classList.toggle('round-2', round === 2);

  scoreEl = h('div.top-right');
  const top = h('header.chat-top',
    h('div.chat-title', h('span.chat-logo', '✨'), h('span', 'LLM 타임머신 ', h('b', '2026')),
      h('span.round-pill.r' + round, `${round}라운드`)),
    scoreEl);

  listEl = h('div.chat-inner');
  bodyEl = h('div.chat-body', listEl);

  input = h('textarea.composer-input', {
    rows: 1, placeholder: round === 1 ? 'AI를 속일 질문을 입력하세요' : '원리를 이용해서 AI를 속여 보세요',
    oninput: () => autoGrow(input),
    onkeydown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
    },
  });
  sendBtn = h('button.send-btn', { onclick: () => (controller ? controller.abort() : send()), title: '보내기' }, '↑');
  composer = h('div.composer',
    h('div.composer-box', input, sendBtn),
    h('p.composer-note', '이름·연락처 같은 개인정보는 입력하지 마세요 · 나쁜 말이나 위험한 내용을 시키는 건 속이기가 아니에요'));

  const center = h('div.chat-center', top, bodyEl, composer);
  root.append(center);

  if (round === 2) {
    panelEl = buildPanel();
    root.append(panelEl);
  } else panelEl = null;

  renderTop();
  renderMessages();
  input.focus();
}

function renderTop() {
  if (!scoreEl) return;
  const round = s().round;
  const { team, ai } = getScore(round);
  clear(scoreEl).append(
    h('div.scoreboard', { title: `${round}라운드 점수` },
      h('span.score-side.team', h('span.score-name', s().team), h('b', team)),
      h('span.score-colon', ':'),
      h('span.score-side.ai', h('b', ai), h('span.score-name', 'AI 🤖'))),
    h('button.btn.btn-sm', { onclick: newChat, title: '대화 기록을 비우고 새로 시작 (점수는 유지)' }, '＋ 새 대화'),
    round === 1
      ? h('button.btn.btn-sm.lock-btn', { onclick: unlockRound2 }, '🔒 2라운드')
      : h('button.btn.btn-sm', { onclick: () => root.classList.toggle('panel-toggled') }, '🧠 공략·확인기'));
}

function renderMessages() {
  clear(listEl);
  const msgs = currentMessages();
  if (!msgs.length) {
    listEl.append(emptyState());
    return;
  }
  for (const m of msgs) listEl.append(messageEl(m));
  scrollDown();
}

function emptyState() {
  const round = s().round;
  if (round === 1) {
    return h('div.chat-empty',
      h('div.empty-emoji', '🤖'),
      h('h2', 'AI를 속여 보세요'),
      h('p', 'AI가 틀린 말을 하게 만들면 ', h('b.c-team', '우리 조 +1점'), ', AI가 "모른다"고 하거나 정확히 답하면 ', h('b.c-ai', 'AI +1점'), '이에요.'),
      h('ul.rules',
        h('li', '답이 나오면 그 아래 버튼으로 우리가 직접 판정해요.'),
        h('li', '힌트는 없어요. 각자의 감으로 도전!'),
        h('li', '같은 대화 안에서는 AI가 앞의 대화를 기억해요. 새로 시작하려면 "새 대화".')));
  }
  return h('div.chat-empty',
    h('div.empty-emoji', '🧠'),
    h('h2', '2라운드: 원리로 공략하기'),
    h('p', '이제 LLM이 어떻게 동작하는지 알았죠? 오른쪽 공략 카드를 보고 약점을 노려 보세요.'),
    h('div.strategy-mini', STRATEGIES.map((st) => h('div.strategy-chip', st.icon, ' ', st.title))));
}

function messageEl(m) {
  if (m.role === 'user') return h('div.msg.user', h('div.bubble', m.content));
  const body = h('div.msg-body.md');
  if (m.error) body.append(h('div.msg-error', '⚠️ ', m.content));
  else body.innerHTML = markdown(m.content);
  const el = h('div.msg.assistant', { 'data-id': m.id },
    h('div.avatar', '✨'),
    h('div.msg-main', body, !m.error && !m.pending && [verdictBar(m), judgeLine(m)]));
  return el;
}

// 🤖 AI 심판 의견 (점수에는 반영되지 않음)
const JUDGE_CHIPS = [['fooled', '😈 속았다'], ['unknown', '🙋 모른다고 함'], ['correct', '✅ 정확함']];

function judgeLine(m) {
  const label = h('span.judge-label', '🤖 AI 심판 의견');
  if (m.judgeError) {
    return h('div.judge', label, h('span.judge-wait', '판정하지 못했어요 '),
      h('button.link', { onclick: () => { patchMsg(m.id, { judgeError: null }); runJudge(m.id); } }, '다시 시도'));
  }
  if (!m.judge) return h('div.judge', label, h('span.judge-wait', '판정하는 중…'));
  const top = JUDGE_CHIPS.reduce((a, b) => (m.judge[b[0]] > m.judge[a[0]] ? b : a))[0];
  const disagree = m.verdict && m.verdict !== top;
  return h('div.judge', label,
    JUDGE_CHIPS.map(([k, text]) => h('span.jchip.' + k + (k === top ? '.top' : ''), text, ' ', h('b', Math.round(m.judge[k] * 100) + '%'))),
    disagree
      ? h('span.judge-note.disagree', '우리 판정과 달라요! 누가 맞을까요?')
      : h('span.judge-note', '점수는 여러분의 판정만 반영돼요'));
}

function patchMsg(id, patch) {
  store.update((st) => {
    const m = st.modern.messages.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
  }, { silent: true });
}

function refreshJudge(id) {
  const m = s().modern.messages.find((x) => x.id === id);
  const old = listEl?.querySelector(`[data-id="${id}"] .judge`);
  if (m && old) old.replaceWith(judgeLine(m));
}

async function runJudge(id) {
  if (judging.has(id)) return;
  const msgs = s().modern.messages;
  const i = msgs.findIndex((x) => x.id === id);
  if (i < 0) return;
  const m = msgs[i];
  let q = null;
  for (let j = i - 1; j >= 0; j--) if (msgs[j].role === 'user' && msgs[j].conv === m.conv) { q = msgs[j]; break; }
  if (!q) return;
  judging.add(id);
  refreshJudge(id);
  try {
    const probs = await judge({ question: q.content, answer: m.content, facts: factsFor(q.content) });
    patchMsg(id, { judge: probs, judgeError: null });
  } catch {
    patchMsg(id, { judgeError: true });
  } finally {
    judging.delete(id);
    refreshJudge(id);
  }
}

function verdictBar(m) {
  const bar = h('div.verdicts',
    h('span.verdict-q', '판정:'),
    VERDICTS.map((v) => h('button.verdict' + (m.verdict === v.key ? '.on.' + v.key : ''), {
      onclick: () => setVerdict(m.id, v.key),
    }, v.label, h('small', v.point))));
  return bar;
}

function setVerdict(id, key) {
  store.update((st) => {
    const m = st.modern.messages.find((x) => x.id === id);
    if (m) m.verdict = m.verdict === key ? null : key;
  });
  const m = s().modern.messages.find((x) => x.id === id);
  const old = listEl.querySelector(`[data-id="${id}"] .verdicts`);
  old?.replaceWith(verdictBar(m));
  refreshJudge(id);
  if (m.verdict === 'fooled') toast('😈 속였다! 우리 조 +1점');
}

async function send() {
  const text = input.value.trim();
  if (!text || controller) return;
  input.value = '';
  autoGrow(input);

  const round = s().round;
  const conv = s().modern.conv;
  const userMsg = { id: uid(), conv, round, role: 'user', content: text, ts: Date.now() };
  const botMsg = { id: uid(), conv, round, role: 'assistant', content: '', ts: Date.now(), verdict: null, pending: true };
  // 앞 대화 맥락: 같은 대화의 정상 메시지만 (최근 20개)
  const history = currentMessages().filter((m) => !m.error).slice(-20).map(({ role, content }) => ({ role, content }));
  store.update((st) => { st.modern.messages.push(userMsg, botMsg); }, { silent: true });

  if (listEl.querySelector('.chat-empty')) clear(listEl);
  listEl.append(messageEl(userMsg));
  const body = h('div.msg-body.md.streaming', h('span.typing', h('i'), h('i'), h('i')));
  const main = h('div.msg-main', body);
  const botEl = h('div.msg.assistant', { 'data-id': botMsg.id }, h('div.avatar', '✨'), main);
  listEl.append(botEl);
  scrollDown();

  controller = new AbortController();
  setBusy(true);
  let acc = '', frame = 0;
  const paint = () => { frame = 0; body.innerHTML = markdown(acc); scrollDown(true); };
  try {
    const full = await chat([...history, { role: 'user', content: text }], {
      signal: controller.signal,
      onToken: (piece) => { acc += piece; if (!frame) frame = requestAnimationFrame(paint); },
    });
    acc = full || acc;
    finish(botMsg.id, { content: acc || '(빈 답변)' });
    runJudge(botMsg.id);
  } catch (err) {
    if (err.name === 'AbortError' && acc) finish(botMsg.id, { content: acc + '\n\n*(중간에 멈춤)*' });
    else finish(botMsg.id, { content: err instanceof ChatError ? err.message : '답변을 받지 못했어요. 다시 보내 주세요.', error: true });
  } finally {
    cancelAnimationFrame(frame);
    controller = null;
    setBusy(false);
  }

  function finish(id, patch) {
    store.update((st) => {
      const m = st.modern.messages.find((x) => x.id === id);
      Object.assign(m, patch, { pending: false });
    });
    const m = s().modern.messages.find((x) => x.id === id);
    if (botEl.isConnected) botEl.replaceWith(messageEl(m));
    scrollDown();
    input?.focus();
  }
}

function setBusy(busy) {
  if (!sendBtn) return;
  sendBtn.textContent = busy ? '■' : '↑';
  sendBtn.title = busy ? '멈추기' : '보내기';
  sendBtn.classList.toggle('busy', busy);
}

function scrollDown(onlyIfNear = false) {
  if (!bodyEl) return;
  const near = bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight < 160;
  if (!onlyIfNear || near) bodyEl.scrollTop = bodyEl.scrollHeight;
}

async function newChat() {
  if (controller) return;
  if (!currentMessages().length) return;
  store.update((st) => { st.modern.conv++; });
  renderMessages();
  input.focus();
}

async function unlockRound2() {
  const code = await promptDialog('2라운드 코드를 입력하세요.\n(선생님이 알려 주실 거예요)', {
    placeholder: '코드',
    ok: '2라운드 시작',
    validate: (v) => (v.replace(/\s/g, '').toLowerCase() === ROUND2_CODE.replace(/\s/g, '').toLowerCase() ? null : '코드가 맞지 않아요.'),
  });
  if (code === null) return;
  controller?.abort();
  store.update((st) => { st.round = 2; st.modern.conv++; });
  render();
  toast('🧠 2라운드 시작! 원리로 공략해 보세요');
}

// ── 2라운드 오른쪽 패널: 공략 카드 + 정답 확인기 ──
function buildPanel() {
  const cards = STRATEGIES.map((st) => {
    const card = h('div.strategy',
      h('button.strategy-head', { onclick: () => card.classList.toggle('open') },
        h('span.strategy-icon', st.icon), h('b', st.title), h('span.chev', '▾')),
      h('div.strategy-body', h('p.principle', st.principle), h('p', st.tip)));
    return card;
  });

  // 글자 수 세기
  const countIn = h('textarea.input.checker-text', { rows: 3, placeholder: '문장을 붙여 넣으세요' });
  const targetIn = h('input.input', { placeholder: '세고 싶은 글자 (선택)' });
  const countOut = h('div.checker-out');
  const updateCount = () => {
    const r = countText(countIn.value, targetIn.value);
    add(clear(countOut), 
      stat('공백 포함', r.all), stat('공백 제외', r.noSpace), stat('단어', r.words),
      r.targetCount !== null && stat(`"${targetIn.value.trim()}"`, r.targetCount));
  };
  countIn.addEventListener('input', updateCount);
  targetIn.addEventListener('input', updateCount);
  updateCount();

  // 계산기
  const calcIn = h('input.input', { placeholder: '예: 4827 × 391 + 12' });
  const calcOut = h('div.calc-out');
  const run = () => {
    try {
      const r = calc(calcIn.value);
      add(clear(calcOut), h('b', '= ', r.text), r.approx && h('small', ' (너무 커서 근삿값)'));
      calcOut.className = 'calc-out ok';
    } catch (e) {
      calcOut.textContent = calcIn.value.trim() ? e.message : '';
      calcOut.className = 'calc-out';
    }
  };
  calcIn.addEventListener('input', run);

  return h('aside.side-panel',
    h('section',
      h('h3', '🧠 공략 카드'),
      h('div.strategies', cards)),
    h('section',
      h('h3', '🔍 정답 확인기'),
      h('p.panel-hint', 'AI 답이 진짜 맞는지 직접 확인해 보세요.'),
      h('label.checker-label', '글자 수 세기'), countIn, targetIn, countOut,
      h('label.checker-label', '계산기'), calcIn, calcOut));
}

const stat = (label, value) => h('div.stat', h('span', label), h('b', value));
