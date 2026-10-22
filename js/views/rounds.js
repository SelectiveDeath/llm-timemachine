// 🏆 라운드 결과: 속이기 1라운드(원리 모름) vs 2라운드(원리로 공략) 성공률 비교
import { store, getRoundStats } from '../store.js';
import { h, add, pct, short } from '../ui.js';

export function mount(el) {
  const [r1, r2] = getRoundStats();
  const page = h('div.page',
    h('div.page-head',
      h('h1', '🏆 라운드 결과'),
      h('p', `${store.state.team}의 현대 LLM 속이기 성적`)));

  if (!r1.tries && !r2.tries) {
    page.append(h('div.card.empty',
      h('div.big', '🏆'),
      h('p', '아직 판정한 답이 없어요.'),
      h('p', h('a', { href: '#/modern' }, '✨ 2026 채팅'), '에서 AI를 속여 보고, 답 아래의 판정 버튼을 눌러 주세요.')));
    el.append(page);
    return;
  }

  add(page,
    h('div.rounds-grid', roundCard(r1, '원리를 모르고 도전'), roundCard(r2, '원리로 약점 공략')),
    message(r1, r2),
    disagreeList([...r1.disagree, ...r2.disagree]),
    winsList([...r1.wins, ...r2.wins]));
  el.append(page);
}

export function unmount() {}

function roundCard(r, sub) {
  return h('div.card.round-card.r' + r.round,
    h('div.round-head', h('span.round-pill.r' + r.round, `${r.round}라운드`), h('span.round-sub', sub)),
    r.tries
      ? [
        h('div.round-rate', pct(r.rate, 0)),
        h('div.round-bar', h('div.round-bar-fill', { style: { width: r.rate * 100 + '%' } })),
        h('p.round-detail', `판정한 답 ${r.tries}개 중 `, h('b', `${r.fooled}번 속임`)),
      ]
      : h('p.round-detail.muted', r.round === 2 && store.state.round === 1 ? '아직 2라운드 전이에요.' : '아직 판정한 답이 없어요.'));
}

function message(r1, r2) {
  if (!r1.tries || !r2.tries) return null;
  const diff = Math.round((r2.rate - r1.rate) * 100);
  const text = diff > 0
    ? `원리를 알고 나니 속이기 성공률이 ${diff}%p 올랐어요! 약점이 어디인지 보이기 시작한 거예요.`
    : diff === 0
      ? '두 라운드 성공률이 같아요. 현대 LLM은 생각보다 잘 안 속죠? 그래도 약점은 남아 있어요.'
      : `2라운드 성공률이 ${-diff}%p 낮아요. 현대 LLM이 그만큼 많이 발전했다는 뜻이기도 해요.`;
  return h('div.card.round-msg', h('span', '💡'), h('p', text));
}

const VERDICT_TEXT = { fooled: '😈 속았다', unknown: '🙋 모른다고 함', correct: '✅ 정확함' };

function disagreeList(list) {
  if (!list.length) return null;
  const topOf = (j) => Object.entries(j).sort((x, y) => y[1] - x[1])[0];
  return h('div.card.wins.disagree-card',
    h('h3', `🤖 AI 심판과 의견이 달랐던 판정 ${list.length}개`),
    h('p.muted', 'AI 심판도 AI예요. 누가 맞았는지 정답 확인기로 확인하고 토론해 보세요.'),
    h('ul', list.map((a) => {
      const [k, p] = topOf(a.judge);
      return h('li',
        h('span.round-pill.r' + a.round, `${a.round}R`),
        h('div', h('b', a.question || '(질문 없음)'),
          h('p.win-answer', `우리: ${VERDICT_TEXT[a.verdict]} · AI 심판: ${VERDICT_TEXT[k]} ${Math.round(p * 100)}%`)));
    })));
}

function winsList(wins) {
  if (!wins.length) return null;
  return h('div.card.wins',
    h('h3', '😈 속이기 성공 기록'),
    h('ul', wins.map((w) => h('li',
      h('span.round-pill.r' + w.round, `${w.round}R`),
      h('div', h('b', w.question || '(질문 없음)'), h('p.win-answer', short(w.answer)))))));
}
