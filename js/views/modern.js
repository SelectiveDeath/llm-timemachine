// ✨ 현대 LLM 화면: 속이기 미션 5개 (활동 1) — gpt-5.4
// 미션 진행은 mission.js가 맡고, 여기에는 현대 LLM에 맞춘 설정만 있다.
import { store } from '../store.js';
import { h } from '../ui.js';
import { generateMission } from '../modern-llm.js';
import { MODELS } from '../config.js';
import { MISSION_TRIES, MISSIONS_PER_ROUND, pickFromPool } from '../missions.js';
import { createMissionView, stars } from './mission.js';

const view = createMissionView({
  bucket: 'modern',
  era: 'modern',
  cls: 'era-modern',
  logo: '✨',
  model: MODELS.modern,
  round: () => 1,
  title: () => h('span.round-pill.r1', '속이기 미션'),
  loseNote: '현대 LLM은 생각보다 잘 안 속죠? 다른 방법으로 다시 도전해 보세요.',

  intro(round, no, start, progress) {
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
  },

  completeTitle: () => '미션 5개 완료!',
  complete: () => h('p.muted', '선생님이 다음 활동을 열 때까지 기다려 주세요. 나중에 과거 LLM에게도 같은 미션을 내 볼 거예요!'),

  async pick(round, no) {
    const avoid = store.state.modern.missions.map((m) => m.title).slice(-20);
    return (await generateMission({ round, category: 'general', difficulty: no, avoid })) ?? pickFromPool(round, avoid, null, no);
  },
});

export const mount = view.mount;
export const unmount = view.unmount;
