// 🏆 미션 결과: 같은 미션 5개를 현대 LLM(활동 1)과 과거 LLM(활동 2)에게 냈을 때의 비교
import { store, getMissionStats, missionMessages } from '../store.js';
import { h, add, pct, short } from '../ui.js';
import { CATEGORIES, MISSIONS_PER_ROUND } from '../missions.js';
import { MODELS } from '../config.js';
import { stars } from './mission.js';

const ROWS = [
  { key: 'modern', cls: 'r1', title: '현대 LLM', sub: `${MODELS.modern.id} · 활동 1` },
  { key: 'past', cls: 'past', title: '과거 LLM', sub: `${MODELS.past.id} · 활동 2 (같은 미션)` },
];

export function mount(el) {
  const stats = getMissionStats();
  const page = h('div.page',
    h('div.page-head',
      h('h1', '🏆 미션 결과'),
      h('p', `${store.state.team}의 속이기 미션 성적`)));

  if (!ROWS.some((r) => stats[r.key].played)) {
    page.append(h('div.card.empty',
      h('div.big', '🏆'),
      h('p', '아직 끝난 미션이 없어요.'),
      h('p', h('a', { href: '#/modern' }, '✨ 현대 LLM'), '에서 미션을 받아 도전해 보세요.')));
    el.append(page);
    return;
  }

  add(page,
    h('div.rounds-grid', ROWS.map((row) => roundCard(row, stats[row.key]))),
    message(stats),
    missionList(ROWS.flatMap((row) => stats[row.key].missions.map((m) => ({ m, row })))));
  el.append(page);
}

export function unmount() {}

function roundCard(row, r) {
  return h('div.card.round-card.' + row.cls,
    h('div.round-head', h('span.round-pill.' + row.cls, row.title), h('span.round-sub', row.sub)),
    r.played
      ? [
        h('div.round-rate', `${r.points}점`),
        h('div.round-bar', h('div.round-bar-fill', { style: { width: (r.points / 15) * 100 + '%' } })),
        h('p.round-detail', `미션 ${r.played}/${MISSIONS_PER_ROUND}개 중 `, h('b', `${r.success}개 성공`), ` (${pct(r.rate, 0)}) · 15점 만점`),
      ]
      : h('p.round-detail.muted', '아직 끝난 미션이 없어요.'));
}

function message({ modern, past }) {
  if (!modern.played || !past.played) return null;
  const text = past.points > modern.points
    ? `같은 미션인데 과거 LLM은 ${past.points}점, 현대 LLM은 ${modern.points}점! 과거 LLM이 훨씬 잘 속았어요.`
    : `같은 미션에서 과거 LLM ${past.points}점, 현대 LLM ${modern.points}점이에요. 과거 LLM도 생각보다 잘 버텼네요.`;
  return h('div.card.round-msg', h('span', '💡'), h('p', text));
}

function missionList(list) {
  return h('div.card.wins',
    h('h3', '📜 미션 기록'),
    h('ul', list.map(({ m, row }) => {
      const win = missionMessages(m).find((x) => x.id === m.winMsgId);
      const cat = CATEGORIES[m.category] ?? CATEGORIES.general;
      return h('li.mission-row.' + m.status,
        h('span.round-pill.' + row.cls, row.title),
        h('div',
          h('b', m.status === 'success' ? '😈 ' : '🤖 ', `${m.no}번 · `, m.title), ' ',
          h('small.muted', `${cat.icon} ${cat.name} · ${stars(m.difficulty)}`),
          h('p.win-answer', m.goal),
          win && h('p.win-quote', '속은 답: “', short(win.content, 120), '”')));
    })));
}
