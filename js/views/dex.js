// 🃏 환각 도감: 과거 LLM(gpt-3.5-turbo)이 미션에서 속아 넘어간 답을 카드로 모아 본다.
import { store, getDex } from '../store.js';
import { h, markdown } from '../ui.js';
import { MODELS } from '../config.js';
import { stars } from './mission.js';

const RESULT = { success: '😈 속았음', fail: '🤖 안 속았음' };

export function mount(el) {
  const cards = getDex();
  const page = h('div.page',
    h('div.page-head',
      h('h1', '🃏 환각 도감'),
      h('p', `${store.state.team} · 과거 LLM(${MODELS.past.id})이 그럴듯하게 지어낸 답들`)));

  if (!cards.length) {
    page.append(h('div.card.empty',
      h('div.big', '🃏'),
      h('p', '아직 모은 카드가 없어요.'),
      h('p', h('a', { href: '#/past' }, '📼 과거 LLM'), '에서 미션에 성공하면 AI가 속은 답이 여기에 자동으로 모여요.')));
    el.append(page);
    return;
  }

  const sameAsModern = cards.filter((c) => c.mission.modernResult === 'fail').length;
  page.append(
    h('div.dex-summary',
      h('div.dex-stat', h('b', cards.length), h('span', '모은 카드')),
      h('div.dex-stat', h('b', sameAsModern), h('span', `${MODELS.modern.id}는 안 속은 미션`))),
    h('div.dex-grid', cards.map(card)));
  el.append(page);
}

export function unmount() {}

function card({ mission, question, answer }) {
  return h('article.dex-card' + (mission.modernResult === 'fail' ? '.best' : ''),
    mission.modernResult === 'fail' && h('div.dex-ribbon', `${MODELS.modern.id}는 안 속은 미션!`),
    h('div.dex-mission', `🎯 ${mission.no}번 · ${stars(mission.difficulty)} · ${mission.title}`),
    h('h3.dex-q', 'Q. ', question),
    h('div.dex-answer.md', { html: markdown(answer.content) }),
    mission.modernResult && h('div.dex-tags', h('span.tag', `1라운드 ${MODELS.modern.id}: ${RESULT[mission.modernResult]}`)));
}
