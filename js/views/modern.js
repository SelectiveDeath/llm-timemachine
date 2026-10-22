// ✨ 현대 LLM 화면: 속이기 미션 1라운드(활동 1), 2라운드(활동 3) — gpt-5.4
// 미션 진행은 mission.js가 맡고, 여기에는 현대 LLM에 맞춘 설정만 있다.
import { store } from '../store.js';
import { h, add, clear } from '../ui.js';
import { generateMission } from '../modern-llm.js';
import { MODELS } from '../config.js';
import { countText, calc } from '../checker.js';
import { MISSION_TRIES, MISSIONS_PER_ROUND, CATEGORIES, ROUND_CATEGORIES, pickFromPool } from '../missions.js';
import { createMissionView, stars } from './mission.js';

const STRATEGIES = [
  { key: 'token', principle: 'LLM은 글자가 아니라 토큰(조각) 단위로 읽어요.', tip: '글자 수 세기, 특정 글자 개수, 거꾸로 쓰기처럼 "글자 하나하나"를 봐야 하는 문제를 내 보세요.' },
  { key: 'plausible', principle: 'LLM은 사실이 아니라 "그럴듯한 다음 말"을 골라요.', tip: '틀린 내용을 사실처럼 깔고 질문해 보세요. 질문 안에 그럴듯한 설정을 자세히 넣을수록 잘 넘어가요.' },
  { key: 'time', principle: 'LLM은 학습한 시점 이후의 일과 우리 동네 일은 몰라요.', tip: '아주 최근 일이나 인터넷에 없는 우리 학교 이야기를 "당연히 알지?" 하는 말투로 물어보세요.' },
  { key: 'probability', principle: 'LLM은 확률로 고르기 때문에 매번 다르게 답할 수 있어요.', tip: '같은 질문을 말만 바꿔서 여러 번 해 보고, 답이 흔들리는지 확인해 보세요.' },
];

const view = createMissionView({
  bucket: 'modern',
  era: 'modern',
  cls: 'era-modern',
  logo: '✨',
  model: MODELS.modern,
  round: () => store.state.round,
  title: (round) => h('span.round-pill.r' + round, `${round}라운드`),
  hasPanel: (round) => round === 2,
  buildPanel,
  loseNote: '현대 LLM은 생각보다 잘 안 속죠? 다른 방법으로 다시 도전해 보세요.',

  intro(round, no, start, progress) {
    if (round === 1) {
      return h('div.chat-empty',
        h('div.empty-emoji', '🎯'),
        h('h2', no > 1 ? `${no}번째 미션에 도전!` : 'AI 속이기 미션'),
        progress,
        h('p', '미션은 모두 ', h('b', `${MISSIONS_PER_ROUND}개`), '이고 갈수록 어려워져요. ', h('b', `질문 ${MISSION_TRIES}번 안에`), ' 현대 LLM이 미션 목표대로 틀린 말을 하게 만들면 성공!'),
        h('ul.rules',
          h('li', 'n번째 미션은 난이도 ⭐ n개, 성공하면 n점! (모두 성공하면 15점) 실패하면 AI가 1승.'),
          h('li', '판정은 AI 심판이 해요. "그대로 따라 말해"라고 시키거나 "가정해 봐"로 말하게 한 건 인정되지 않아요.'),
          h('li', '힌트는 없어요. 각자의 감으로 도전!')),
        h('button.btn.btn-primary.btn-lg', { onclick: () => start('general') }, `🎯 ${no}번째 미션 받기 · ${stars(no)}`));
    }
    return h('div.chat-empty',
      h('div.empty-emoji', '🧠'),
      h('h2', `2라운드: ${no}번째 미션 · ${stars(no)}`),
      progress,
      h('p', '원하는 원리를 골라 미션을 받으세요. 오른쪽 공략 카드를 참고하세요.'),
      h('div.category-picks',
        ROUND_CATEGORIES[2].map((c) => h('button.category-pick.' + c, { onclick: () => start(c) },
          h('span.cp-icon', CATEGORIES[c].icon), CATEGORIES[c].name)),
        h('button.category-pick.any', { onclick: () => start(ROUND_CATEGORIES[2][Math.floor(Math.random() * 4)]) }, h('span.cp-icon', '🎲'), '아무거나')));
  },

  completeTitle: (round) => `${round}라운드 완료!`,
  complete: (round) => h('p.muted', round === 1
    ? '선생님이 다음 활동을 열 때까지 기다려 주세요. 과거 LLM에게도 같은 미션을 내 볼 거예요!'
    : '선생님이 비교 리포트를 열 때까지 기다려 주세요.'),

  async pick(round, no, category) {
    const avoid = store.state.modern.missions.map((m) => m.title).slice(-20);
    // '확률의 함정'은 게임 마스터가 자꾸 다른 종류의 미션을 내서, 검수된 예비 목록만 쓴다
    const ai = category === 'probability' ? null : await generateMission({ round, category, difficulty: no, avoid });
    return ai ?? pickFromPool(round, avoid, round === 2 ? category : null, no);
  },
});

export const mount = view.mount;
export const unmount = view.unmount;

// 2라운드 오른쪽 패널: 공략 카드 + 정답 확인기
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
