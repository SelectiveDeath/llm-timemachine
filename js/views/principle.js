// 🧩 원리 체험 (파트 1.5 연장선): PPT에서 본 "다음 말 확률"을 진짜 언어 모델(KoGPT2)로 직접 확인한다.
// 문장을 쓰면 다음에 올 말 후보와 확률이 실시간으로 뜨고, Tab이나 클릭으로 골라 이어 쓸 수 있다.
import { store } from '../store.js';
import { h, add, clear, debounce, pct, toast } from '../ui.js';
import { kogpt2, displayToken, appendToken } from '../kogpt2.js';
import { MODELS } from '../config.js';

const EXAMPLES = ['오늘 점심에 먹은', '대한민국의 수도는', '옛날 옛적에 어느 마을에', '인공지능은 앞으로', '우리 학교의 자랑은'];

let root, unsubModel, predict, busy = false;

export function mount(el) {
  root = h('div.page.principle');
  el.append(root);
  const status = h('div.pr-status');
  unsubModel = kogpt2.subscribe((m) => renderStatus(status, m));

  const st = store.state.principle;
  const ghostText = h('span.ghost-text');
  const ghost = h('span.ghost');
  const layer = h('div.write-layer', ghostText, ghost);
  const ta = h('textarea.write-input', { spellcheck: false, placeholder: '여기에 문장을 쓰기 시작하세요…', value: st.writeText });
  const tokensLine = h('div.token-line');
  const table = h('div.prob-area');
  const tempVal = h('span.temp-val');
  const temp = h('input', { type: 'range', min: 0, max: 2, step: 0.1, value: st.temperature });
  const genBtn = h('button.btn', '끝까지 써 줘 ▶');
  const stopBtn = h('button.btn', { disabled: true }, '멈추기');
  const clearBtn = h('button.btn', '지우기');

  let top = null; // 현재 1등 후보
  let shownFor = null; // 확률 표가 계산된 문장

  const save = debounce(() => store.update((s) => { s.principle.writeText = ta.value; }, { silent: true }), 400);
  const atEnd = () => ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;

  const syncGhost = () => {
    ghostText.textContent = ta.value;
    let g = '';
    if (top && atEnd() && !busy && shownFor === ta.value) {
      const d = displayToken(top.token);
      if (!d.end && !d.newline) g = appendToken(ta.value, top.token).slice(ta.value.replace(/\s+$/, '').length);
    }
    ghost.textContent = g;
    layer.scrollTop = ta.scrollTop;
  };

  predict = debounce(async () => {
    const text = ta.value;
    shownFor = null;
    syncGhost();
    try {
      const res = await kogpt2.next(text, { k: 8, temperature: Math.max(+temp.value, 0.05) });
      if (res.stale || text !== ta.value) return;
      shownFor = text;
      top = res.candidates.find((c) => !displayToken(c.token).end && !displayToken(c.token).newline) ?? null;
      renderTokens(tokensLine, text ? res.inputTokens : []);
      renderTable(table, res.candidates, accept);
      syncGhost();
    } catch { /* 모델 로딩 실패는 상단 상태 상자가 알려 줌 */ }
  }, 280);

  function accept(token) {
    if (busy) return;
    ta.value = appendToken(ta.value, token);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    top = null;
    syncGhost();
    save();
    predict();
  }

  ta.addEventListener('input', () => { top = null; syncGhost(); save(); predict(); });
  ta.addEventListener('scroll', () => { layer.scrollTop = ta.scrollTop; });
  ta.addEventListener('keyup', syncGhost);
  ta.addEventListener('click', syncGhost);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && ghost.textContent) { e.preventDefault(); accept(top.token); }
  });

  const showTemp = () => {
    const v = +temp.value;
    tempVal.textContent = v.toFixed(1) + (v === 0 ? ' · 항상 1등만' : v < 0.7 ? ' · 얌전함' : v <= 1.2 ? ' · 보통' : ' · 엉뚱함');
  };
  temp.addEventListener('input', () => {
    showTemp();
    store.update((s) => { s.principle.temperature = +temp.value; }, { silent: true });
    predict();
  });
  showTemp();

  const setBusy = (b) => {
    busy = b;
    ta.readOnly = b;
    genBtn.disabled = clearBtn.disabled = b;
    stopBtn.disabled = !b;
  };
  genBtn.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    top = null;
    syncGhost();
    try {
      await kogpt2.generate(ta.value, { maxTokens: 40, temperature: +temp.value }, (piece) => {
        ta.value += piece;
        ta.scrollTop = ta.scrollHeight;
        ghostText.textContent = ta.value;
      });
    } catch (e) {
      toast('이어 쓰기에 실패했어요: ' + e.message);
    }
    setBusy(false);
    save();
    predict();
  });
  stopBtn.addEventListener('click', () => kogpt2.cancel());
  clearBtn.addEventListener('click', () => {
    if (busy) return;
    ta.value = '';
    top = null;
    syncGhost();
    save();
    predict();
    ta.focus();
  });

  const exampleBtn = (ex) => h('button.pr-example', {
    onclick: () => {
      if (busy) return;
      ta.value = ex;
      ta.focus();
      ta.setSelectionRange(ex.length, ex.length);
      top = null; syncGhost(); save(); predict();
    },
  }, ex);

  root.append(
    h('div.page-head',
      h('h1', '🧩 원리 체험: 다음 말 확률'),
      h('p', 'PPT에서 본 "다음에 올 말의 확률"을 진짜 언어 모델로 확인해 봐요.')),
    h('div.pr-model',
      h('span.model-chip', MODELS.principle.id), ` ${MODELS.principle.year}년 · ${MODELS.principle.desc} · 질문에 답하도록 훈련되지 않고, 글을 `, h('b', '이어 쓰기만'), ' 하는 작은 모델이에요.'),
    status,
    h('div.card.pr-card',
      h('p.pr-help', '문장을 쓰면 모델이 다음에 올 말을 예측해요. 회색 글씨는 1등 후보예요. ', h('kbd', 'Tab'), '을 누르면 받아들이고, 아래 표에서 후보를 눌러 직접 골라도 돼요.'),
      h('div.pr-examples', h('span.muted', '예시: '), EXAMPLES.map(exampleBtn)),
      h('div.write-wrap', layer, ta),
      h('div.pr-controls',
        h('label.pr-temp', '무작위성(온도) ', temp, tempVal),
        h('span.pr-btns', genBtn, stopBtn, clearBtn)),
      tokensLine),
    table,
    h('p.pr-note', '💡 "새 단어"는 띄어 쓰고 붙는 조각, "이어 붙음"은 앞 글자에 바로 붙는 조각이에요. 무작위성을 0으로 하면 언제나 1등만, 높이면 낮은 순위의 말도 골라서 엉뚱해져요.'));

  syncGhost();
  predict();
}

export function unmount() {
  unsubModel?.();
  predict?.cancel();
  if (busy) kogpt2.cancel();
  busy = false;
}

function renderStatus(el, m) {
  clear(el);
  if (m.status === 'ready') return;
  if (m.status === 'error') {
    el.append(h('div.card.pr-error',
      h('b', '모델을 불러오지 못했어요. '), '인터넷 연결을 확인하고 다시 시도해 주세요. ',
      h('button.btn.btn-sm', { onclick: () => kogpt2.load().catch(() => {}) }, '다시 시도')));
    return;
  }
  const p = Math.floor(m.progress * 100);
  el.append(h('div.card.pr-loading',
    h('div', p >= 100 ? '모델을 실행할 준비를 하는 중…' : `모델 불러오는 중… ${p}%`),
    h('div.pr-progress', h('div.pr-progress-bar', { style: { width: p + '%' } })),
    h('small.muted', '처음 한 번만 약 130MB를 내려받아요. 이후에는 바로 열려요.')));
}

function renderTokens(el, tokens) {
  clear(el);
  if (!tokens.length) return;
  add(el, h('span.token-label', '모델이 본 조각(토큰) ', h('b', tokens.length), '개:'),
    tokens.map((t) => h('span.tok', t.replace(/▁/g, '␣'))));
}

function renderTable(el, candidates, onPick) {
  clear(el);
  const max = candidates[0]?.prob || 1;
  el.append(h('div.card.prob-card',
    h('div.prob-title', '다음에 올 말 후보 (상위 8개) · 눌러서 고르기'),
    h('div.prob-list', candidates.map((c, i) => {
      const d = displayToken(c.token);
      return h('button.prob-row', { onclick: () => onPick(c.token), title: '이 말을 붙이기' },
        h('span.rank', i + 1),
        h('span.cand', h('b', d.text), h('small', d.end || d.newline ? '' : d.newWord ? '새 단어' : '이어 붙음')),
        h('span.bar', h('span.bar-fill' + (i === 0 ? '.first' : ''), { style: { width: (c.prob / max) * 100 + '%' } })),
        h('span.p', pct(c.prob)));
    }))));
}
