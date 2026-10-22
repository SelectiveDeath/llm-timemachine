// ✨ 현대 LLM 화면: 속이기 미션 1라운드(활동 1), 2라운드(활동 3)
// 게임 마스터 AI가 미션을 내고, 학생은 질문 5번 안에 현대 LLM이 미션 목표대로 "속은 답"을 하게 만들어야 한다.
// 답마다 AI 심판이 성공 확률을 판정한다.
import { store, uid, getScore, activeMission, missionMessages, missionTries } from '../store.js';
import { h, add, clear, markdown, promptDialog, confirmDialog, toast } from '../ui.js';
import { judge, generateMission } from '../modern-llm.js';
import { ROUND2_CODE, MODELS } from '../config.js';
import { countText, calc, factsFor } from '../checker.js';
import { MISSION_TRIES, CATEGORIES, ROUND_CATEGORIES, pickFromPool } from '../missions.js';
import { buildComposer, userBubble, assistantShell, streamReply, scrollToBottom } from './chat-common.js';

const STRATEGIES = [
  { key: 'token', principle: 'LLM은 글자가 아니라 토큰(조각) 단위로 읽어요.', tip: '글자 수 세기, 특정 글자 개수, 거꾸로 쓰기처럼 "글자 하나하나"를 봐야 하는 문제를 내 보세요.' },
  { key: 'plausible', principle: 'LLM은 사실이 아니라 "그럴듯한 다음 말"을 골라요.', tip: '틀린 내용을 사실처럼 깔고 질문해 보세요. 질문 안에 그럴듯한 설정을 자세히 넣을수록 잘 넘어가요.' },
  { key: 'time', principle: 'LLM은 학습한 시점 이후의 일과 우리 동네 일은 몰라요.', tip: '아주 최근 일이나 인터넷에 없는 우리 학교 이야기를 "당연히 알지?" 하는 말투로 물어보세요.' },
  { key: 'probability', principle: 'LLM은 확률로 고르기 때문에 매번 다르게 답할 수 있어요.', tip: '같은 질문을 말만 바꿔서 여러 번 해 보고, 답이 흔들리는지 확인해 보세요.' },
];
const SUCCESS = 0.5; // 심판의 성공 확률이 이 값 이상이면 미션 성공

let root, scroller, inner, composer, scoreEl, panelEl;
let controller = null; // 답변 중이면 AbortController
let starting = false;  // 미션을 받아 오는 중
const judging = new Set();
let unsub;

const s = () => store.state;

export function mount(el) {
  cleanupInterrupted();
  root = h('div.chat.era-modern');
  el.append(root);
  render();
  unsub = store.subscribe(() => renderScore());
  const m = activeMission();
  if (m) judgeLastIfMissing(m);
}

export function unmount() {
  controller?.abort();
  unsub?.();
}

// 새로고침 등으로 답을 받다 끊긴 경우: 빈 답이면 질문까지 지워서 기회를 돌려준다
function cleanupInterrupted() {
  store.update((st) => {
    const msgs = st.modern.messages;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (!m.pending) continue;
      if (m.content) { m.pending = false; continue; }
      msgs.splice(i, 1);
      if (msgs[i - 1]?.role === 'user') msgs.splice(i - 1, 1);
    }
  }, { silent: true });
}

// 지금 화면에 보여 줄 미션: 진행 중인 미션, 없으면 방금 끝난 미션(결과 확인 전)
function shownMission() {
  const active = activeMission();
  if (active) return active;
  const last = [...s().modern.missions].reverse().find((m) => m.round === s().round && m.status !== 'cancel');
  return last && last.id !== s().modern.seen ? last : null;
}

function render() {
  clear(root);
  const round = s().round;
  root.classList.toggle('round-2', round === 2);

  scoreEl = h('div.top-right');
  const top = h('header.chat-top',
    h('div.chat-title',
      h('span.chat-logo', '✨'), h('span', 'LLM 타임머신 ', h('b', MODELS.modern.year)),
      h('span.model-chip', MODELS.modern.id),
      h('span.round-pill.r' + round, `${round}라운드`)),
    scoreEl);

  inner = h('div.chat-inner');
  scroller = h('div.chat-body', inner);
  composer = buildComposer({
    placeholder: '미션 목표대로 AI가 말하게 만들 질문을 입력하세요',
    note: '이름·연락처 같은 개인정보는 입력하지 마세요 · 나쁜 말이나 위험한 내용을 시키는 건 속이기가 아니에요',
    onSend: send,
    onStop: () => controller?.abort(),
  });
  root.append(h('div.chat-center', top, scroller, composer.el));

  panelEl = round === 2 ? buildPanel() : null;
  if (panelEl) root.append(panelEl);

  renderScore();
  renderBody();
}

function renderScore() {
  if (!scoreEl) return;
  const round = s().round;
  const { team, ai } = getScore(round);
  clear(scoreEl).append(
    h('div.scoreboard', { title: `${round}라운드 점수: 성공한 미션의 별 개수 합 vs 실패한 미션 수` },
      h('span.score-side.team', h('span.score-name', s().team), h('b', team), h('small', '점')),
      h('span.score-colon', ':'),
      h('span.score-side.ai', h('b', ai), h('small', '승'), h('span.score-name', 'AI 🤖'))),
    round === 1
      ? h('button.btn.btn-sm.lock-btn', { onclick: unlockRound2 }, '🔒 2라운드')
      : h('button.btn.btn-sm', { onclick: () => root.classList.toggle('panel-toggled') }, '🧠 공략·확인기'));
}

function renderBody() {
  clear(inner);
  const m = shownMission();
  if (!m) {
    inner.append(startScreen());
    composer.setLocked('먼저 미션을 받아 주세요');
    return;
  }
  inner.append(missionCard(m));
  const msgs = missionMessages(m);
  msgs.forEach((msg) => inner.append(msg.role === 'user' ? userBubble(msg.content) : messageEl(msg, m)));
  if (m.status !== 'active') inner.append(resultBanner(m));
  updateLock(m);
  scrollToBottom(scroller);
}

function updateLock(m) {
  if (m.status === 'success') composer.setLocked('🎉 미션 성공! 아래에서 다음 미션을 받으세요');
  else if (m.status === 'fail') composer.setLocked('미션이 끝났어요. 아래에서 다음 미션을 받으세요');
  else if (missionTries(m) >= MISSION_TRIES) composer.setLocked('심판의 판정을 기다리는 중…');
  else composer.setLocked(null);
}

// ── 미션 받기 ───────────────────────────────

function startScreen() {
  const round = s().round;
  const done = s().modern.missions.filter((m) => m.round === round && (m.status === 'success' || m.status === 'fail')).length;
  if (starting) {
    return h('div.chat-empty', h('div.empty-emoji.spin', '🎲'), h('h2', '게임 마스터가 미션을 고르는 중…'));
  }
  if (round === 1) {
    return h('div.chat-empty',
      h('div.empty-emoji', '🎯'),
      h('h2', done ? '다음 미션에 도전!' : 'AI 속이기 미션'),
      h('p', '게임 마스터 AI가 미션을 줘요. ', h('b', `질문 ${MISSION_TRIES}번 안에`), ' 현대 LLM이 미션 목표대로 틀린 말을 하게 만들면 성공!'),
      h('ul.rules',
        h('li', '성공하면 미션 난이도(⭐)만큼 우리 조 점수, 실패하면 AI가 1승.'),
        h('li', '판정은 AI 심판이 해요. "그대로 따라 말해"라고 시키거나 "가정해 봐"로 말하게 한 건 인정되지 않아요.'),
        h('li', '힌트는 없어요. 각자의 감으로 도전!')),
      h('button.btn.btn-primary.btn-lg', { onclick: () => startMission('general') }, '🎯 미션 받기'));
  }
  return h('div.chat-empty',
    h('div.empty-emoji', '🧠'),
    h('h2', '2라운드: 원리로 공략하기'),
    h('p', '원하는 원리의 미션을 골라 보세요. 오른쪽 공략 카드를 참고하세요.'),
    h('div.category-picks',
      ROUND_CATEGORIES[2].map((c) => h('button.category-pick.' + c, { onclick: () => startMission(c) },
        h('span.cp-icon', CATEGORIES[c].icon), CATEGORIES[c].name)),
      h('button.category-pick.any', { onclick: () => startMission(ROUND_CATEGORIES[2][Math.floor(Math.random() * 4)]) }, h('span.cp-icon', '🎲'), '아무거나')));
}

async function startMission(category) {
  if (starting) return;
  starting = true;
  renderBody();
  const round = s().round;
  const avoid = s().modern.missions.map((m) => m.title).slice(-20);
  const got = (await generateMission({ round, category, avoid })) ?? pickFromPool(round, avoid, round === 2 ? category : null);
  starting = false;
  store.update((st) => {
    st.modern.conv++;
    st.modern.missions.push({
      id: uid(), conv: st.modern.conv, round, category: got.category ?? category, difficulty: got.difficulty,
      title: got.title, goal: got.goal, source: got.source, status: 'active', winMsgId: null, ts: Date.now(),
    });
  });
  renderBody();
  composer.focus();
}

function missionCard(m) {
  const tries = missionTries(m);
  const cat = CATEGORIES[m.category] ?? CATEGORIES.general;
  return h('div.mission-card.' + m.category + '.' + m.status,
    h('div.mc-top',
      h('span.mc-badge', '🎯 미션'),
      h('span.mc-cat', cat.icon, ' ', cat.name),
      h('span.mc-stars', { title: `난이도 ${m.difficulty} (성공하면 ${m.difficulty}점)` }, '⭐'.repeat(m.difficulty)),
      h('span.mc-source', m.source === 'ai' ? '게임 마스터 AI 출제' : '예비 미션')),
    h('h3.mc-title', m.title),
    h('p.mc-goal', m.goal),
    h('div.mc-foot',
      h('span.mc-tries', '남은 질문 ',
        Array.from({ length: MISSION_TRIES }, (_, i) => h('i.dot' + (i < tries ? '.used' : ''))),
        h('b', ` ${Math.max(0, MISSION_TRIES - tries)}/${MISSION_TRIES}`)),
      m.status === 'active' && h('button.btn.btn-sm', { onclick: () => giveUp(m.id) }, '🏳️ 포기하고 다른 미션')));
}

async function giveUp(id) {
  if (controller) return;
  if (!(await confirmDialog('이 미션을 포기할까요? AI가 1승을 가져가요.', { ok: '포기하기' }))) return;
  finishMission(id, { status: 'fail', gaveUp: true });
}

function finishMission(id, patch) {
  store.update((st) => Object.assign(st.modern.missions.find((x) => x.id === id), patch));
  renderBody();
}

function resultBanner(m) {
  const next = h('button.btn.btn-primary', { onclick: () => { store.update((st) => { st.modern.seen = m.id; }); renderBody(); } }, '다음 미션 받기 →');
  if (m.status === 'success') {
    return h('div.result-banner.win', h('div.rb-emoji', '🎉'),
      h('div', h('b', `미션 성공! 우리 조 +${m.difficulty}점`), h('p', 'AI가 미션 목표대로 속은 답을 했어요. 위에 표시된 답을 확인해 보세요.')), next);
  }
  return h('div.result-banner.lose', h('div.rb-emoji', m.gaveUp ? '🏳️' : '🤖'),
    h('div', h('b', m.gaveUp ? '미션 포기 · AI 1승' : `AI 승리 · ${MISSION_TRIES}번 안에 속이지 못했어요`),
      h('p', '현대 LLM은 생각보다 잘 안 속죠? 다른 방법으로 다시 도전해 보세요.')), next);
}

// ── 대화와 판정 ─────────────────────────────

function messageEl(msg, mission) {
  const body = h('div.msg-body.md');
  if (msg.error) body.append(h('div.msg-error', '⚠️ ', msg.content));
  else body.innerHTML = markdown(msg.content);
  const win = mission.winMsgId === msg.id;
  return h('div.msg.assistant' + (win ? '.win' : ''), { 'data-id': msg.id },
    h('div.avatar', '✨'),
    h('div.msg-main', win && h('div.win-badge', '😈 속았다!'), body, !msg.error && !msg.pending && judgeLine(msg)));
}

function judgeLine(msg) {
  const label = h('span.judge-label', '🤖 AI 심판');
  if (msg.judgeError) {
    return h('div.judge', label, h('span.judge-wait', '판정하지 못했어요 '),
      h('button.link', { onclick: () => runJudge(msg.id) }, '다시 판정'));
  }
  if (msg.judge == null) return h('div.judge', label, h('span.judge-wait', '판정하는 중…'));
  const p = Math.round(msg.judge * 100);
  return h('div.judge', label,
    h('span.judge-meter', h('span.judge-fill' + (msg.judge >= SUCCESS ? '.hit' : ''), { style: { width: p + '%' } })),
    h('span.judge-text', msg.judge >= SUCCESS ? `속았다 (확신 ${p}%)` : `아직 안 속았어요 (속았을 확률 ${p}%)`));
}

function refreshMessage(id) {
  const msg = s().modern.messages.find((x) => x.id === id);
  const mission = s().modern.missions.find((x) => x.conv === msg?.conv);
  const old = inner?.querySelector(`.msg.assistant[data-id="${id}"]`);
  if (msg && mission && old) old.replaceWith(messageEl(msg, mission));
}

async function send(text) {
  const m = activeMission();
  if (!m || controller || missionTries(m) >= MISSION_TRIES) return;
  const round = s().round;
  const userMsg = { id: uid(), conv: m.conv, round, role: 'user', content: text, ts: Date.now() };
  const botMsg = { id: uid(), conv: m.conv, round, role: 'assistant', content: '', ts: Date.now(), pending: true };
  const history = missionMessages(m).filter((x) => !x.error).map(({ role, content }) => ({ role, content }));
  store.update((st) => { st.modern.messages.push(userMsg, botMsg); }, { silent: true });

  inner.querySelector('.mission-card')?.replaceWith(missionCard(m));
  inner.append(userBubble(text));
  const shell = assistantShell('✨', botMsg.id);
  inner.append(shell.el);
  scrollToBottom(scroller);
  updateLock(m);

  controller = new AbortController();
  composer.setBusy(true);
  const r = await streamReply({
    messages: [...history, { role: 'user', content: text }], era: 'modern', body: shell.body, signal: controller.signal,
    onPaint: () => scrollToBottom(scroller, true),
  });
  controller = null;
  composer.setBusy(false);

  if (r.error) {
    // 전송 실패는 기회를 쓰지 않은 것으로: 질문과 답을 지우고 입력창에 질문을 되돌린다
    store.update((st) => { st.modern.messages = st.modern.messages.filter((x) => x.id !== userMsg.id && x.id !== botMsg.id); });
    renderBody();
    composer.input.value = text;
    toast(r.content, 3500);
    return;
  }
  store.update((st) => Object.assign(st.modern.messages.find((x) => x.id === botMsg.id), { content: r.content, pending: false }));
  shell.el.replaceWith(messageEl(s().modern.messages.find((x) => x.id === botMsg.id), m));
  scrollToBottom(scroller);
  await runJudge(botMsg.id);
  composer.focus();
}

function judgeLastIfMissing(m) {
  const last = missionMessages(m).filter((x) => x.role === 'assistant' && !x.error).pop();
  if (last && last.judge == null && !last.judgeError) runJudge(last.id);
}

async function runJudge(id) {
  if (judging.has(id)) return;
  const msg = s().modern.messages.find((x) => x.id === id);
  const mission = s().modern.missions.find((x) => x.conv === msg?.conv);
  if (!msg || !mission || mission.status !== 'active') return;
  judging.add(id);
  store.update((st) => { st.modern.messages.find((x) => x.id === id).judgeError = false; }, { silent: true });
  refreshMessage(id);

  const convo = missionMessages(mission).filter((x) => !x.error && !x.pending);
  const upto = convo.slice(0, convo.findIndex((x) => x.id === id) + 1);
  const questions = upto.filter((x) => x.role === 'user').map((x) => x.content).join('\n');
  try {
    const p = await judge({ goal: mission.goal, messages: upto, facts: factsFor(questions) });
    store.update((st) => { st.modern.messages.find((x) => x.id === id).judge = p; }, { silent: true });
    if (p >= SUCCESS) {
      finishMission(mission.id, { status: 'success', winMsgId: id });
      toast(`🎉 미션 성공! 우리 조 +${mission.difficulty}점`);
    } else if (missionTries(mission) >= MISSION_TRIES) {
      finishMission(mission.id, { status: 'fail' });
    } else {
      refreshMessage(id);
    }
  } catch {
    store.update((st) => { st.modern.messages.find((x) => x.id === id).judgeError = true; }, { silent: true });
    refreshMessage(id);
  } finally {
    judging.delete(id);
  }
}

// ── 2라운드 ────────────────────────────────

async function unlockRound2() {
  const code = await promptDialog('2라운드 코드를 입력하세요.\n(선생님이 알려 주실 거예요)', {
    placeholder: '코드',
    ok: '2라운드 시작',
    validate: (v) => (v.replace(/\s/g, '').toLowerCase() === ROUND2_CODE.replace(/\s/g, '').toLowerCase() ? null : '코드가 맞지 않아요.'),
  });
  if (code === null) return;
  controller?.abort();
  // 1라운드에서 진행 중이던 미션은 점수에 넣지 않고 취소 처리
  store.update((st) => {
    for (const m of st.modern.missions) if (m.round === 1 && m.status === 'active') m.status = 'cancel';
    st.round = 2;
  });
  render();
  toast('🧠 2라운드 시작! 원리로 공략해 보세요');
}

// 오른쪽 패널: 공략 카드 + 정답 확인기
function buildPanel() {
  const cards = STRATEGIES.map((st) => {
    const cat = CATEGORIES[st.key];
    const card = h('div.strategy',
      h('button.strategy-head', { onclick: () => card.classList.toggle('open') },
        h('span.strategy-icon', cat.icon), h('b', cat.name), h('span.chev', '▾')),
      h('div.strategy-body', h('p.strategy-principle', st.principle), h('p', st.tip)));
    return card;
  });

  const countIn = h('textarea.input.checker-text', { rows: 3, placeholder: '문장을 붙여 넣으세요' });
  const targetIn = h('input.input', { placeholder: '세고 싶은 글자 (선택)' });
  const countOut = h('div.checker-out');
  const updateCount = () => {
    const r = countText(countIn.value, targetIn.value);
    add(clear(countOut), stat('공백 포함', r.all), stat('공백 제외', r.noSpace), stat('단어', r.words),
      r.targetCount !== null && stat(`"${targetIn.value.trim()}"`, r.targetCount));
  };
  countIn.addEventListener('input', updateCount);
  targetIn.addEventListener('input', updateCount);
  updateCount();

  const calcIn = h('input.input', { placeholder: '예: 4827 × 391 + 12' });
  const calcOut = h('div.calc-out');
  calcIn.addEventListener('input', () => {
    try {
      const r = calc(calcIn.value);
      add(clear(calcOut), h('b', '= ', r.text), r.approx && h('small', ' (너무 커서 근삿값)'));
      calcOut.className = 'calc-out ok';
    } catch (e) {
      calcOut.textContent = calcIn.value.trim() ? e.message : '';
      calcOut.className = 'calc-out';
    }
  });

  return h('aside.side-panel',
    h('section', h('h3', '🧠 공략 카드'), h('div.strategies', cards)),
    h('section',
      h('h3', '🔍 정답 확인기'),
      h('p.panel-hint', '미션에 쓸 문제의 진짜 답을 미리 확인해 보세요.'),
      h('label.checker-label', '글자 수 세기'), countIn, targetIn, countOut,
      h('label.checker-label', '계산기'), calcIn, calcOut));
}

const stat = (label, value) => h('div.stat', h('span', label), h('b', value));
