// 🃏 환각 도감: 과거 LLM 질문하기에서 "관찰" 표시한 답들을 카드로 모아 본다.
import { store, getDex } from '../store.js';
import { h } from '../ui.js';

const TAG_LABEL = { pretend: '아는 척 ⭐', changes: '매번 바뀜 🔄', offtopic: '딴소리 💬' };

export function mount(el) {
  const cards = getDex();
  const page = h('div.page',
    h('div.page-head',
      h('h1', '🃏 환각 도감'),
      h('p', `${store.state.team} · 과거 LLM에게서 모은 그럴듯한 거짓말들`)));

  if (!cards.length) {
    page.append(h('div.card.empty',
      h('div.big', '🃏'),
      h('p', '아직 모은 카드가 없어요.'),
      h('p', h('a', { href: '#/retro', onclick: () => store.update((s) => { s.retro.tab = 'ask'; }, { silent: true }) }, '📼 과거 LLM → 질문하기'),
        '에서 답을 보고 "관찰" 버튼을 누르면 여기에 모여요.')));
    el.append(page);
    return;
  }

  const count = (k) => cards.filter((c) => c.tags.includes(k)).length;
  page.append(
    h('div.dex-summary',
      h('div.dex-stat', h('b', cards.length), h('span', '모은 카드')),
      Object.entries(TAG_LABEL).map(([k, label]) => h('div.dex-stat', h('b', count(k)), h('span', label)))),
    h('div.dex-grid', cards.map(card)));
  el.append(page);
}

export function unmount() {}

function card(q) {
  return h('article.dex-card' + (q.best ? '.best' : ''),
    q.best && h('div.dex-ribbon', '🏆 가장 그럴듯한 거짓말'),
    h('div.dex-kind', h('span.tag' + (q.kind === 'fake' ? '.danger' : '.new'), q.kind === 'fake' ? '지어낸 질문' : '진짜 질문')),
    h('h3.dex-q', q.question),
    h('ol.dex-answers', q.answers.slice(0, 3).map((a) => h('li', a))),
    q.answers.length > 3 && h('p.dex-more', `외 ${q.answers.length - 3}개 답`),
    h('div.dex-tags', q.tags.map((t) => h('span.tag.old', TAG_LABEL[t]))));
}
