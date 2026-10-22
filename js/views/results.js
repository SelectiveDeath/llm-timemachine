// 🏆 미션 결과: 속이기 1라운드(원리 모름) vs 2라운드(원리로 공략) 비교
import { store, getMissionStats, missionMessages } from '../store.js';
import { h, add, pct, short } from '../ui.js';
import { CATEGORIES } from '../missions.js';

export function mount(el) {
  const [r1, r2] = getMissionStats();
  const page = h('div.page',
    h('div.page-head',
      h('h1', '🏆 미션 결과'),
      h('p', `${store.state.team}의 현대 LLM 속이기 성적`)));

  if (!r1.played && !r2.played) {
    page.append(h('div.card.empty',
      h('div.big', '🏆'),
      h('p', '아직 끝난 미션이 없어요.'),
      h('p', h('a', { href: '#/modern' }, '✨ 현대 LLM'), '에서 미션을 받아 도전해 보세요.')));
    el.append(page);
    return;
  }

  add(page,
    h('div.rounds-grid', roundCard(r1, '원리를 모르고 도전'), roundCard(r2, '원리로 약점 공략')),
    message(r1, r2),
    missionList([...r1.missions, ...r2.missions]));
  el.append(page);
}

export function unmount() {}

function roundCard(r, sub) {
  return h('div.card.round-card.r' + r.round,
    h('div.round-head', h('span.round-pill.r' + r.round, `${r.round}라운드`), h('span.round-sub', sub)),
    r.played
      ? [
        h('div.round-rate', pct(r.rate, 0)),
        h('div.round-bar', h('div.round-bar-fill', { style: { width: r.rate * 100 + '%' } })),
        h('p.round-detail', `미션 ${r.played}개 중 `, h('b', `${r.success}개 성공`), ` · 얻은 점수 ${r.points}점`),
      ]
      : h('p.round-detail.muted', r.round === 2 && store.state.round === 1 ? '아직 2라운드 전이에요.' : '아직 끝난 미션이 없어요.'));
}

function message(r1, r2) {
  if (!r1.played || !r2.played) return null;
  const diff = Math.round((r2.rate - r1.rate) * 100);
  const text = diff > 0
    ? `원리를 알고 나니 미션 성공률이 ${diff}%p 올랐어요! 약점이 어디인지 보이기 시작한 거예요.`
    : diff === 0
      ? '두 라운드 성공률이 같아요. 현대 LLM은 생각보다 잘 안 속죠? 그래도 약점은 남아 있어요.'
      : `2라운드 성공률이 ${-diff}%p 낮아요. 그만큼 현대 LLM이 많이 발전했다는 뜻이기도 해요.`;
  return h('div.card.round-msg', h('span', '💡'), h('p', text));
}

function missionList(missions) {
  return h('div.card.wins',
    h('h3', '📜 미션 기록'),
    h('ul', missions.map((m) => {
      const msgs = missionMessages(m);
      const win = msgs.find((x) => x.id === m.winMsgId);
      const cat = CATEGORIES[m.category] ?? CATEGORIES.general;
      return h('li.mission-row.' + m.status,
        h('span.round-pill.r' + m.round, `${m.round}R`),
        h('div',
          h('b', m.status === 'success' ? '😈 ' : '🤖 ', m.title), ' ',
          h('small.muted', `${cat.icon} ${cat.name} · ${'⭐'.repeat(m.difficulty)}`),
          h('p.win-answer', m.goal),
          win && h('p.win-quote', '속은 답: “', short(win.content, 120), '”')));
    })));
}
