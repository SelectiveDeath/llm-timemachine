// 🃏 환각 도감: 과거 LLM(gpt-3.5-turbo)의 답 중 "관찰" 표시한 것들을 카드로 모아 본다.
import { store, getDex } from '../store.js';
import { h, markdown } from '../ui.js';
import { MODELS } from '../config.js';
import { TAGS } from './past.js';

const TAG_LABEL = Object.fromEntries(TAGS.map((t) => [t.key, t.label]));

export function mount(el) {
  const cards = getDex();
  const page = h('div.page',
    h('div.page-head',
      h('h1', '🃏 환각 도감'),
      h('p', `${store.state.team} · 과거 LLM(${MODELS.past.id})에게서 모은 그럴듯한 거짓말들`)));

  if (!cards.length) {
    page.append(h('div.card.empty',
      h('div.big', '🃏'),
      h('p', '아직 모은 카드가 없어요.'),
      h('p', h('a', { href: '#/past' }, '📼 과거 LLM'), '에서 답 아래의 "관찰" 버튼을 누르면 여기에 모여요.')));
    el.append(page);
    return;
  }

  const count = (k) => cards.filter((c) => c.tags?.includes(k)).length;
  page.append(
    h('div.dex-summary',
      h('div.dex-stat', h('b', cards.length), h('span', '모은 카드')),
      TAGS.map((t) => h('div.dex-stat', h('b', count(t.key)), h('span', t.label)))),
    h('div.dex-grid', cards.map(card)));
  el.append(page);
}

export function unmount() {}

function card(c) {
  return h('article.dex-card' + (c.best ? '.best' : ''),
    c.best && h('div.dex-ribbon', '🏆 가장 그럴듯한 거짓말'),
    h('h3.dex-q', 'Q. ', c.question),
    h('div.dex-answer.md', { html: markdown(c.content) }),
    h('div.dex-tags', (c.tags ?? []).map((t) => h('span.tag.old', TAG_LABEL[t]))));
}
