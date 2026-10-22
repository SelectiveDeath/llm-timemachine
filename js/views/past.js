// 📼 과거 LLM 화면 (활동 2): gpt-3.5-turbo(2022, 초기 ChatGPT)에게 활동 1과 같은 미션 5개를 다시 도전한다.
// 같은 미션인데 현대 LLM은 안 속고 과거 LLM은 속는 모습을 비교하는 활동. 속은 답은 🃏 환각 도감에 자동으로 모인다.
// 미션 진행은 mission.js가 맡고, 여기에는 과거 LLM에 맞춘 설정만 있다. 화면은 2026 화면의 흑백 버전 (css/past.css).
import { store } from '../store.js';
import { h } from '../ui.js';
import { generateMission } from '../modern-llm.js';
import { MODELS } from '../config.js';
import { MISSION_TRIES, MISSIONS_PER_ROUND, pickFromPool } from '../missions.js';
import { createMissionView, stars } from './mission.js';

// 활동 1에서 끝낸 n번째 미션 (같은 미션을 과거 LLM에게)
const roundOneMission = (no) => store.state.modern.missions.find((m) => m.round === 1 && m.no === no && (m.status === 'success' || m.status === 'fail'));
const RESULT = { success: '😈 속았음', fail: '🤖 안 속았음' };

const view = createMissionView({
  bucket: 'past',
  era: 'past',
  cls: 'era-past',
  logo: '◐',
  model: MODELS.past,
  round: () => 1,
  title: () => h('span.era-note', MODELS.past.desc),
  loseNote: '과거 LLM도 이 미션은 버텼네요. 그래도 현대 LLM보다는 잘 속죠?',

  intro(round, no, start, progress) {
    const prev = roundOneMission(no);
    return h('div.chat-empty',
      h('div.empty-emoji', '📼'),
      h('h2', no > 1 ? `${no}번째 미션 · ${stars(no)}` : '2022년으로 왔어요'),
      progress,
      no === 1 && h('p', '이 AI는 ', h('b', `초기 ChatGPT(${MODELS.past.id})`), '예요. 활동 1에서 현대 LLM에게 냈던 ', h('b', '같은 미션 5개'), '를 이번엔 과거 LLM에게 도전해요.'),
      no === 1 && h('ul.rules',
        h('li', `질문 ${MISSION_TRIES}번 안에 속이면 성공! 점수 방식은 활동 1과 같아요.`),
        h('li', 'AI가 속은 답은 🃏 환각 도감에 자동으로 모여요.')),
      prev && h('p.muted', `활동 1에서 ${MODELS.modern.id}는 이 미션에서 ${RESULT[prev.status]}`),
      h('button.btn.btn-primary.btn-lg', { onclick: () => start('general') }, `🎯 ${no}번째 미션 받기 · ${stars(no)}`));
  },

  completeTitle: () => '과거 LLM 미션 완료!',
  complete(round, { points }) {
    const modern = store.state.modern.missions.filter((m) => m.round === 1 && m.status === 'success').reduce((t, m) => t + m.difficulty, 0);
    return [
      h('p', `같은 미션에서 ${MODELS.modern.id}는 `, h('b', `${modern}점`), `, ${MODELS.past.id}는 `, h('b', `${points}점`), '이었어요.'),
      h('p.muted', '선생님이 다음 활동을 열 때까지 기다려 주세요.'),
    ];
  },

  cardExtra: (m) => m.modernResult && h('p.mc-compare', `활동 1에서 ${MODELS.modern.id}: `, h('b', RESULT[m.modernResult])),

  async pick(round, no) {
    const prev = roundOneMission(no);
    if (prev) return { title: prev.title, goal: prev.goal, category: prev.category, source: prev.source, replayOf: prev.id, modernResult: prev.status };
    // 활동 1을 다 못 했으면 같은 난이도로 새로 만든다
    const avoid = [...store.state.modern.missions, ...store.state.past.missions].map((m) => m.title).slice(-20);
    return (await generateMission({ round: 1, category: 'general', difficulty: no, avoid })) ?? pickFromPool(1, avoid, null, no);
  },
});

export const mount = view.mount;
export const unmount = view.unmount;
