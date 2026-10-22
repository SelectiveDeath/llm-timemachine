// 속이기 미션 화면 (현대 LLM, 과거 LLM 공용)
// 게임 마스터가 미션을 내고, 학생은 질문 5번 안에 AI가 미션 목표대로 "속은 답"을 하게 만들어야 한다.
// 미션 5개, n번째 미션은 난이도 ⭐n = 성공 점수 n. 답마다 AI 심판이 성공 확률을 판정한다.
//
// createMissionView(cfg)
//   bucket   'modern' | 'past'   기록이 저장되는 곳 (store.state[bucket])
//   era      'modern' | 'past'   대화하는 모델
//   cls, logo, model             화면 모양과 표시할 모델 정보
//   round()                      지금 라운드
//   title(round)                 제목 옆 표시 (라운드 등)
//   intro(round, no, start, progress)  미션 받기 화면 (start(category)를 부르면 미션 시작)
//   completeTitle(round), complete(round, summary)  라운드 완료 화면
//   pick(round, no, category)    미션 고르기 → { title, goal, category, source, ... }
//   cardExtra(mission)           미션 카드에 덧붙일 내용
//   loseNote                     실패했을 때 안내 문구
import { store, uid, getScore, activeMission, missionMessages, missionTries } from '../store.js';
import { h, add, clear, markdown, confirmDialog, toast } from '../ui.js';
import { judge } from '../modern-llm.js';
import { factsFor } from '../checker.js';
import { MISSION_TRIES, MISSIONS_PER_ROUND, CATEGORIES } from '../missions.js';
import { buildComposer, userBubble, assistantShell, streamReply, scrollToBottom } from './chat-common.js';

const SUCCESS = 0.5; // 심판의 성공 확률이 이 값 이상이면 미션 성공
export const stars = (n) => '⭐'.repeat(n);

export function createMissionView(cfg) {
  let root, scroller, inner, composer, scoreEl;
  let controller = null; // 답변 중이면 AbortController
  let starting = false;  // 미션을 받아 오는 중
  const judging = new Set();
  let unsub;

  const s = () => store.state;
  const B = () => s()[cfg.bucket];
  const round = () => cfg.round();
  // 이번 라운드에서 끝난(성공·실패) 미션 수. "미션이 이상해요"로 바꾼 미션은 세지 않는다
  const doneCount = (r) => B().missions.filter((m) => m.round === r && (m.status === 'success' || m.status === 'fail')).length;

  function mount(el) {
    cleanupInterrupted();
    root = h('div.chat.' + cfg.cls);
    el.append(root);
    render();
    unsub = store.subscribe(() => renderScore());
    const m = activeMission(cfg.bucket, round());
    if (m) judgeLastIfMissing(m);
  }

  function unmount() {
    controller?.abort();
    unsub?.();
  }

  // 새로고침 등으로 답을 받다 끊긴 경우: 빈 답이면 질문까지 지워서 기회를 돌려준다
  function cleanupInterrupted() {
    store.update((st) => {
      const msgs = st[cfg.bucket].messages;
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
    const active = activeMission(cfg.bucket, round());
    if (active) return active;
    const last = [...B().missions].reverse().find((m) => m.round === round() && m.status !== 'cancel');
    return last && last.id !== B().seen ? last : null;
  }

  function render() {
    clear(root);
    const r = round();
    scoreEl = h('div.top-right');
    const top = h('header.chat-top',
      h('div.chat-title',
        h('span.chat-logo', cfg.logo), h('span', 'LLM 타임머신 ', h('b', cfg.model.year)),
        h('span.model-chip', cfg.model.id),
        cfg.title(r)),
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

    renderScore();
    renderBody();
  }

  function renderScore() {
    if (!scoreEl) return;
    const r = round();
    const { team, ai } = getScore(r, cfg.bucket);
    add(clear(scoreEl),
      h('div.scoreboard', { title: '성공한 미션의 별 개수 합 vs 실패한 미션 수' },
        h('span.score-side.team', h('span.score-name', s().team), h('b', team), h('small', '점')),
        h('span.score-colon', ':'),
        h('span.score-side.ai', h('b', ai), h('small', '승'), h('span.score-name', 'AI 🤖'))));
  }

  function renderBody() {
    clear(inner);
    const m = shownMission();
    if (!m) {
      inner.append(startScreen());
      composer.setLocked(doneCount(round()) >= MISSIONS_PER_ROUND ? '이번 라운드의 미션을 모두 마쳤어요' : '먼저 미션을 받아 주세요');
      return;
    }
    inner.append(missionCard(m));
    missionMessages(m).forEach((msg) => inner.append(msg.role === 'user' ? userBubble(msg.content) : messageEl(msg, m)));
    if (m.status !== 'active') inner.append(resultBanner(m));
    updateLock(m);
    scrollToBottom(scroller);
  }

  function updateLock(m) {
    if (m.status === 'success') composer.setLocked('🎉 미션 성공! 아래 버튼을 눌러 계속하세요');
    else if (m.status === 'fail') composer.setLocked('미션이 끝났어요. 아래 버튼을 눌러 계속하세요');
    else if (missionTries(m) >= MISSION_TRIES) composer.setLocked('심판의 판정을 기다리는 중…');
    else composer.setLocked(null);
  }

  // ── 미션 받기 ───────────────────────────────

  function startScreen() {
    const r = round();
    const done = doneCount(r);
    if (starting) return h('div.chat-empty', h('div.empty-emoji.spin', '🎲'), h('h2', '게임 마스터가 미션을 고르는 중…'));
    if (done >= MISSIONS_PER_ROUND) return roundComplete(r);
    const progress = h('div.mission-progress',
      Array.from({ length: MISSIONS_PER_ROUND }, (_, i) => h('span.mp-step' + (i < done ? '.done' : i === done ? '.next' : ''), i + 1)));
    return cfg.intro(r, done + 1, startMission, progress);
  }

  function roundComplete(r) {
    const missions = B().missions.filter((m) => m.round === r && (m.status === 'success' || m.status === 'fail')).sort((a, b) => a.no - b.no);
    const wins = missions.filter((m) => m.status === 'success');
    const points = wins.reduce((t, m) => t + m.difficulty, 0);
    return h('div.chat-empty.round-done',
      h('div.empty-emoji', '🏁'),
      h('h2', cfg.completeTitle(r)),
      h('div.mission-progress', missions.map((m) => h('span.mp-step.' + (m.status === 'success' ? 'win' : 'lose'), { title: m.title }, m.status === 'success' ? '😈' : '🤖'))),
      h('p', `미션 ${MISSIONS_PER_ROUND}개 중 `, h('b', `${wins.length}개 성공`), ' · 점수 ', h('b', `${points}점`), ' / 15점'),
      cfg.complete(r, { wins: wins.length, points }),
      h('a.btn', { href: '#/results' }, '🏆 미션 결과 보기'));
  }

  async function startMission(category) {
    if (starting) return;
    const r = round();
    const no = doneCount(r) + 1;
    if (no > MISSIONS_PER_ROUND) return;
    starting = true;
    renderBody();
    const got = await cfg.pick(r, no, category);
    starting = false;
    store.update((st) => {
      const b = st[cfg.bucket];
      b.conv++;
      b.missions.push({
        id: uid(), bucket: cfg.bucket, conv: b.conv, round: r, no, difficulty: no,
        category: got.category ?? category, title: got.title, goal: got.goal, source: got.source,
        replayOf: got.replayOf ?? null, modernResult: got.modernResult ?? null,
        status: 'active', winMsgId: null, ts: Date.now(),
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
        h('span.mc-badge', `🎯 미션 ${m.no}/${MISSIONS_PER_ROUND}`),
        h('span.mc-cat', cat.icon, ' ', cat.name),
        h('span.mc-stars', { title: `난이도 ${m.difficulty} (성공하면 ${m.difficulty}점)` }, stars(m.difficulty), h('small', ` ${m.difficulty}점`)),
        h('span.mc-source', m.replayOf ? '활동 1과 같은 미션' : m.source === 'ai' ? '게임 마스터 AI 출제' : '예비 미션')),
      h('h3.mc-title', m.title),
      h('p.mc-goal', m.goal),
      cfg.cardExtra?.(m),
      h('div.mc-foot',
        h('span.mc-tries', '남은 질문 ',
          Array.from({ length: MISSION_TRIES }, (_, i) => h('i.dot' + (i < tries ? '.used' : ''))),
          h('b', ` ${Math.max(0, MISSION_TRIES - tries)}/${MISSION_TRIES}`)),
        m.status === 'active' && h('span.mc-actions',
          h('button.btn.btn-sm', { onclick: () => reportBad(m.id), title: '미션이 사실과 다르거나 말이 안 되면' }, '🚩 미션이 이상해요'),
          h('button.btn.btn-sm', { onclick: () => giveUp(m.id) }, '🏳️ 포기하기'))));
  }

  // AI가 만든 미션은 가끔 틀릴 수 있어서, 이상한 미션은 점수 없이 바꿀 수 있게 한다
  async function reportBad(id) {
    if (controller) return;
    if (!(await confirmDialog('이 미션이 사실과 다르거나 말이 안 되나요?\n점수 변화 없이 새 미션으로 바꿔요.', { ok: '미션 바꾸기' }))) return;
    store.update((st) => { st[cfg.bucket].missions.find((x) => x.id === id).status = 'cancel'; });
    renderBody();
  }

  async function giveUp(id) {
    if (controller) return;
    if (!(await confirmDialog('이 미션을 포기할까요? AI가 1승을 가져가고 다음 미션으로 넘어가요.', { ok: '포기하기' }))) return;
    finishMission(id, { status: 'fail', gaveUp: true });
  }

  function finishMission(id, patch) {
    store.update((st) => Object.assign(st[cfg.bucket].missions.find((x) => x.id === id), patch));
    renderBody();
  }

  function resultBanner(m) {
    const last = doneCount(m.round) >= MISSIONS_PER_ROUND;
    const next = h('button.btn.btn-primary', { onclick: () => { store.update((st) => { st[cfg.bucket].seen = m.id; }); renderBody(); } }, last ? '라운드 결과 보기 →' : '다음 미션 받기 →');
    if (m.status === 'success') {
      return h('div.result-banner.win', h('div.rb-emoji', '🎉'),
        h('div', h('b', `미션 성공! 우리 조 +${m.difficulty}점`), h('p', 'AI가 미션 목표대로 속은 답을 했어요. 위에 표시된 답을 확인해 보세요.')), next);
    }
    return h('div.result-banner.lose', h('div.rb-emoji', m.gaveUp ? '🏳️' : '🤖'),
      h('div', h('b', m.gaveUp ? '미션 포기 · AI 1승' : `AI 승리 · ${MISSION_TRIES}번 안에 속이지 못했어요`), h('p', cfg.loseNote)), next);
  }

  // ── 대화와 판정 ─────────────────────────────

  function messageEl(msg, mission) {
    const body = h('div.msg-body.md');
    if (msg.error) body.append(h('div.msg-error', '⚠️ ', msg.content));
    else body.innerHTML = markdown(msg.content);
    const win = mission.winMsgId === msg.id;
    return h('div.msg.assistant' + (win ? '.win' : ''), { 'data-id': msg.id },
      h('div.avatar', cfg.logo),
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
    const msg = B().messages.find((x) => x.id === id);
    const mission = B().missions.find((x) => x.conv === msg?.conv);
    const old = inner?.querySelector(`.msg.assistant[data-id="${id}"]`);
    if (msg && mission && old) old.replaceWith(messageEl(msg, mission));
  }

  async function send(text) {
    const m = activeMission(cfg.bucket, round());
    if (!m || controller || missionTries(m) >= MISSION_TRIES) return;
    const userMsg = { id: uid(), conv: m.conv, round: m.round, role: 'user', content: text, ts: Date.now() };
    const botMsg = { id: uid(), conv: m.conv, round: m.round, role: 'assistant', content: '', ts: Date.now(), pending: true };
    const history = missionMessages(m).filter((x) => !x.error).map(({ role, content }) => ({ role, content }));
    store.update((st) => { st[cfg.bucket].messages.push(userMsg, botMsg); }, { silent: true });

    inner.querySelector('.mission-card')?.replaceWith(missionCard(m));
    inner.append(userBubble(text));
    const shell = assistantShell(cfg.logo, botMsg.id);
    inner.append(shell.el);
    scrollToBottom(scroller);
    updateLock(m);

    controller = new AbortController();
    composer.setBusy(true);
    const r = await streamReply({
      messages: [...history, { role: 'user', content: text }], era: cfg.era, body: shell.body, signal: controller.signal,
      onPaint: () => scrollToBottom(scroller, true),
    });
    controller = null;
    composer.setBusy(false);

    if (r.error) {
      // 전송 실패는 기회를 쓰지 않은 것으로: 질문과 답을 지우고 입력창에 질문을 되돌린다
      store.update((st) => { st[cfg.bucket].messages = st[cfg.bucket].messages.filter((x) => x.id !== userMsg.id && x.id !== botMsg.id); });
      renderBody();
      composer.input.value = text;
      toast(r.content, 3500);
      return;
    }
    store.update((st) => Object.assign(st[cfg.bucket].messages.find((x) => x.id === botMsg.id), { content: r.content, pending: false }));
    shell.el.replaceWith(messageEl(B().messages.find((x) => x.id === botMsg.id), m));
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
    const msg = B().messages.find((x) => x.id === id);
    const mission = B().missions.find((x) => x.conv === msg?.conv);
    if (!msg || !mission || mission.status !== 'active') return;
    judging.add(id);
    store.update((st) => { st[cfg.bucket].messages.find((x) => x.id === id).judgeError = false; }, { silent: true });
    refreshMessage(id);

    const convo = missionMessages(mission).filter((x) => !x.error && !x.pending);
    const upto = convo.slice(0, convo.findIndex((x) => x.id === id) + 1);
    const questions = upto.filter((x) => x.role === 'user').map((x) => x.content).join('\n');
    try {
      const p = await judge({ goal: mission.goal, messages: upto, facts: factsFor(questions) });
      store.update((st) => { st[cfg.bucket].messages.find((x) => x.id === id).judge = p; }, { silent: true });
      if (p >= SUCCESS) {
        finishMission(mission.id, { status: 'success', winMsgId: id });
        toast(`🎉 미션 성공! 우리 조 +${mission.difficulty}점`);
      } else if (missionTries(mission) >= MISSION_TRIES) {
        finishMission(mission.id, { status: 'fail' });
      } else {
        refreshMessage(id);
      }
    } catch {
      store.update((st) => { st[cfg.bucket].messages.find((x) => x.id === id).judgeError = true; }, { silent: true });
      refreshMessage(id);
    } finally {
      judging.delete(id);
    }
  }

  return { mount, unmount };
}
