// 📼 과거 LLM 화면 (활동 2): 2019년 무렵 연구 데모 사이트 분위기
//  - 같이 쓰기(2-A): 문장을 쓰면 다음 말 확률이 실시간으로 뜬다
//  - 질문하기(2-B): 진짜/가짜 짝 질문으로 환각 관찰 → 환각 도감
import { store, uid } from '../store.js';
import { h, add, clear, debounce, pct, confirmDialog, toast } from '../ui.js';
import { oldLLM, displayToken, appendToken } from '../old-llm.js';

const WRITE_EXAMPLES = ['오늘 점심에 먹은', '대한민국의 수도는', '옛날 옛적에 어느 마을에', '인공지능은 앞으로', '우리 학교의 자랑은'];
const REAL_EXAMPLES = ['해리 포터를 쓴 사람은 누구인가요?', '대한민국의 수도는 어디인가요?', '한글을 만든 사람은 누구인가요?'];
const FAKE_EXAMPLES = ['『서울의 파란 코끼리』를 쓴 작가는 누구인가요?', '2019년 노벨 떡볶이상을 받은 사람은 누구인가요?', '조선의 왕 세종 2세는 어떤 업적을 남겼나요?'];
const TAGS = [
  { key: 'pretend', label: '아는 척 ⭐', hint: '없는 것인데 있는 것처럼 답함' },
  { key: 'changes', label: '매번 바뀜 🔄', hint: '물어볼 때마다 답이 달라짐' },
  { key: 'offtopic', label: '딴소리 💬', hint: '질문과 상관없는 말을 함' },
];

// 질문하기에서 모델에게 실제로 넣는 형식 (tools/notes.md 참고)
export const askPrompt = (q) => `질문: ${q}\n답변:`;
export const ASK_OPTS = { maxTokens: 48, temperature: 0.9, stopAtNewline: true };

let root, tabEl, unsubModel, busy = false;

export function mount(el) {
  root = h('div.retro');
  el.append(root);
  const page = h('div.retro-page');
  root.append(page);

  tabEl = h('div.retro-tab');
  const status = h('div.retro-status');
  unsubModel = oldLLM.subscribe((m) => renderStatus(status, m));

  page.append(
    h('header.retro-head',
      h('div.retro-title-row', h('span.retro-title', 'KoGPT2 데모'), h('span.retro-ver', 'GPT-2 구조 · 한국어 · 2021')),
      h('p.retro-desc', '1억 2천5백만 개의 가중치를 가진 언어 모델을 여러분의 컴퓨터에서 직접 실행합니다. 이 모델은 질문에 대답하도록 훈련되지 않았으며, 주어진 글을 ', h('b', '이어 쓰는'), ' 것만 할 수 있습니다.'),
      h('nav.retro-tabs',
        tabLink('write', '같이 쓰기'), ' | ', tabLink('ask', '질문하기'))),
    h('hr.retro-hr'),
    status,
    tabEl,
    h('hr.retro-hr'),
    h('footer.retro-foot',
      '모델: skt/kogpt2-base-v2 (SK텔레콤, CC BY-NC-SA 4.0) · 브라우저용으로 변환(int8) · ',
      '이 페이지는 2019~2021년 무렵의 언어 모델 연구 데모 사이트 분위기를 재현했습니다.'));

  renderTab();
}

export function unmount() {
  unsubModel?.();
  if (busy) oldLLM.cancel();
  writeState?.predict.cancel();
}

function tabLink(key, label) {
  return h('a.retro-tablink', {
    href: '#/retro', 'data-tab': key,
    onclick: (e) => {
      e.preventDefault();
      if (busy) return;
      store.update((s) => { s.retro.tab = key; }, { silent: true });
      renderTab();
    },
  }, label);
}

function renderTab() {
  const tab = store.state.retro.tab;
  for (const a of root.querySelectorAll('.retro-tablink')) a.classList.toggle('on', a.dataset.tab === tab);
  clear(tabEl);
  if (tab === 'ask') renderAsk(tabEl);
  else renderWrite(tabEl);
}

function renderStatus(el, m) {
  clear(el);
  if (m.status === 'ready') return;
  if (m.status === 'error') {
    el.append(h('div.retro-box.retro-error',
      h('b', '모델을 불러오지 못했습니다.'), h('br'),
      '인터넷 연결을 확인하거나 잠시 후 다시 시도해 주세요. 계속 안 되면 선생님께 알려 주세요.',
      h('br'), h('small', '(', m.error, ')'), h('br'),
      h('button.retro-btn', { onclick: () => oldLLM.load().catch(() => {}) }, '다시 시도')));
    return;
  }
  const p = Math.floor(m.progress * 100);
  el.append(h('div.retro-box',
    h('div', p >= 100 ? '모델을 실행할 준비를 하는 중...' : `모델 불러오는 중... ${p}%`),
    h('div.retro-progress', h('div.retro-progress-bar', { style: { width: p + '%' } })),
    h('small', '처음 한 번만 약 130MB를 내려받습니다. 이후에는 바로 열립니다.')));
}

// ── 같이 쓰기 ───────────────────────────────

let writeState = null;

function renderWrite(el) {
  const s = store.state.retro;
  const ghostText = h('span.ghost-text');
  const ghost = h('span.ghost');
  const layer = h('div.write-layer', ghostText, ghost);
  const ta = h('textarea.write-input', { spellcheck: false, placeholder: '여기에 문장을 쓰기 시작하세요...', value: s.writeText });
  const tokensLine = h('div.token-line');
  const table = h('div.prob-area');
  const tempVal = h('span.temp-val');
  const temp = h('input', { type: 'range', min: 0, max: 2, step: 0.1, value: s.temperature });
  const genBtn = h('button.retro-btn', '끝까지 써 줘 ▶');
  const stopBtn = h('button.retro-btn', { disabled: true }, '멈추기');
  const clearBtn = h('button.retro-btn', '지우기');

  let top = null; // 현재 1등 후보
  let reqText = null;

  const save = debounce(() => store.update((st) => { st.retro.writeText = ta.value; }, { silent: true }), 400);
  const atEnd = () => ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;

  const syncGhost = () => {
    ghostText.textContent = ta.value;
    let g = '';
    if (top && atEnd() && !busy && reqText === ta.value) {
      const d = displayToken(top.token);
      if (!d.end && !d.newline) g = appendToken(ta.value, top.token).slice(ta.value.replace(/\s+$/, '').length);
    }
    ghost.textContent = g;
    layer.scrollTop = ta.scrollTop;
  };

  const predict = debounce(async () => {
    const text = ta.value;
    reqText = null;
    syncGhost();
    try {
      const res = await oldLLM.next(text, { k: 8, temperature: Math.max(+temp.value, 0.05) });
      if (res.stale || text !== ta.value) return;
      reqText = text;
      top = res.candidates.find((c) => !displayToken(c.token).end && !displayToken(c.token).newline) ?? null;
      renderTokens(tokensLine, text ? res.inputTokens : []);
      renderTable(table, res.candidates, accept);
      syncGhost();
    } catch { /* 로딩 실패는 상단 상태 상자가 알려 줌 */ }
  }, 280);
  writeState = { predict };

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
    if (e.key === 'Tab' && ghost.textContent) {
      e.preventDefault();
      accept(top.token);
    }
  });

  const showTemp = () => {
    const v = +temp.value;
    tempVal.textContent = v.toFixed(1) + (v === 0 ? ' (항상 1등만)' : v < 0.7 ? ' (얌전함)' : v <= 1.2 ? ' (보통)' : ' (엉뚱함)');
  };
  temp.addEventListener('input', () => {
    showTemp();
    store.update((st) => { st.retro.temperature = +temp.value; }, { silent: true });
    predict();
  });
  showTemp();

  genBtn.addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    top = null;
    syncGhost();
    try {
      await oldLLM.generate(ta.value, { maxTokens: 40, temperature: +temp.value }, (piece) => {
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
  stopBtn.addEventListener('click', () => oldLLM.cancel());
  clearBtn.addEventListener('click', () => {
    if (busy) return;
    ta.value = '';
    top = null;
    syncGhost();
    save();
    predict();
    ta.focus();
  });

  function setBusy(b) {
    busy = b;
    ta.readOnly = b;
    genBtn.disabled = b;
    clearBtn.disabled = b;
    stopBtn.disabled = !b;
  }

  el.append(
    h('p', '문장을 쓰면 모델이 ', h('b', '다음에 올 말'), '을 예측합니다. 회색 글씨는 모델이 1등으로 고른 말이며, ', h('kbd', 'Tab'), ' 키를 누르면 받아들입니다. 아래 표의 후보를 눌러 직접 골라도 됩니다.'),
    h('p.retro-examples', '예시: ', WRITE_EXAMPLES.map((ex, i) => [i ? ' · ' : '', h('a', {
      href: '#/retro', onclick: (e) => {
        e.preventDefault();
        if (busy) return;
        ta.value = ex;
        ta.focus();
        ta.setSelectionRange(ex.length, ex.length);
        top = null; syncGhost(); save(); predict();
      },
    }, ex)])),
    h('div.write-wrap', layer, ta),
    h('div.retro-controls',
      h('label', '무작위성(온도): ', temp, ' ', tempVal),
      h('span.retro-btns', genBtn, stopBtn, clearBtn)),
    tokensLine,
    table,
    h('p.retro-note', '※ "새 단어"는 앞 말과 띄어서 붙는 조각, "이어 붙음"은 앞 글자에 바로 붙는 조각입니다. 무작위성을 0으로 하면 언제나 1등만 고르고, 높이면 낮은 순위의 말도 골라서 엉뚱해집니다.'));

  syncGhost();
  if (oldLLM.status !== 'error') predict();
  else renderTable(table, null, accept);
}

function renderTokens(el, tokens) {
  clear(el);
  if (!tokens.length) return;
  add(el, h('span.token-label', '모델이 본 조각(토큰) ', h('b', tokens.length), '개: '),
    tokens.map((t) => h('span.tok', t.replace(/▁/g, '␣'))));
}

function renderTable(el, candidates, onPick) {
  clear(el);
  if (!candidates) {
    el.append(h('div.retro-box', '모델이 준비되면 여기에 다음 말 확률이 나타납니다.'));
    return;
  }
  const max = candidates[0]?.prob || 1;
  el.append(h('table.prob-table',
    h('caption', '다음에 올 말 후보 (상위 8개) — 눌러서 고르기'),
    h('thead', h('tr', h('th', '순위'), h('th', '후보'), h('th.bar-col', '확률'), h('th', ''))),
    h('tbody', candidates.map((c, i) => {
      const d = displayToken(c.token);
      return h('tr', { onclick: () => onPick(c.token), title: '이 말을 붙이기' },
        h('td.rank', i + 1),
        h('td.cand', h('span.cand-text', d.text), h('small.cand-kind', d.end ? '' : d.newline ? '' : d.newWord ? '새 단어' : '이어 붙음')),
        h('td.bar-col', h('div.bar', h('div.bar-fill', { style: { width: (c.prob / max) * 100 + '%' } }))),
        h('td.p', pct(c.prob)));
    }))));
}

// ── 질문하기 ───────────────────────────────

function renderAsk(el) {
  const input = h('input.retro-input', { placeholder: '질문을 입력하세요', maxlength: 120 });
  const kindReal = h('input', { type: 'radio', name: 'kind', value: 'real', checked: true });
  const kindFake = h('input', { type: 'radio', name: 'kind', value: 'fake' });
  const askBtn = h('button.retro-btn', '묻기');
  const ask3Btn = h('button.retro-btn', '3번 묻기');
  const stopBtn = h('button.retro-btn', { disabled: true }, '멈추기');
  const list = h('div.q-list');

  const kind = () => (kindFake.checked ? 'fake' : 'real');
  const setBusy = (b) => {
    busy = b;
    askBtn.disabled = ask3Btn.disabled = b;
    stopBtn.disabled = !b;
    for (const btn of list.querySelectorAll('.q-again')) btn.disabled = b;
  };

  async function ask(times) {
    const q = input.value.trim();
    if (!q || busy) { input.focus(); return; }
    // 같은 질문은 기존 기록에 답을 이어 붙인다.
    let rec = store.state.retro.questions.find((x) => x.question === q);
    store.update((st) => {
      if (rec) {
        rec = st.retro.questions.find((x) => x.id === rec.id);
        rec.kind = kind();
        rec.ts = Date.now();
      } else {
        rec = { id: uid(), question: q, kind: kind(), answers: [], tags: [], best: false, ts: Date.now() };
        st.retro.questions.push(rec);
      }
    }, { silent: true });
    await askMore(rec.id, times);
  }

  async function askMore(id, times) {
    setBusy(true);
    renderList();
    try {
      for (let i = 0; i < times; i++) {
        const rec = store.state.retro.questions.find((x) => x.id === id);
        const card = list.querySelector(`[data-id="${id}"]`);
        const li = h('li.streaming', '');
        card?.querySelector('.q-answers').append(li);
        const r = await oldLLM.generate(askPrompt(rec.question), ASK_OPTS, (piece) => { li.textContent += piece; });
        const answer = r.text.trim() || '(아무 말도 하지 않음)';
        store.update((st) => { st.retro.questions.find((x) => x.id === id).answers.push(answer); }, { silent: true });
        li.textContent = answer;
        li.classList.remove('streaming');
        if (!busy) break;
      }
    } catch (e) {
      toast('답을 만들지 못했어요: ' + e.message);
    }
    setBusy(false);
    renderList();
  }

  function renderList() {
    clear(list);
    const qs = [...store.state.retro.questions].sort((a, b) => b.ts - a.ts);
    if (!qs.length) {
      list.append(h('p.retro-muted', '아직 질문이 없습니다.'));
      return;
    }
    for (const q of qs) list.append(questionCard(q));
  }

  function questionCard(q) {
    const toggleTag = (key) => {
      store.update((st) => {
        const r = st.retro.questions.find((x) => x.id === q.id);
        r.tags = r.tags.includes(key) ? r.tags.filter((t) => t !== key) : [...r.tags, key];
      });
      renderList();
    };
    const toggleBest = () => {
      store.update((st) => {
        for (const r of st.retro.questions) r.best = r.id === q.id ? !q.best : false;
      });
      renderList();
      if (!q.best) toast('🏆 가장 그럴듯한 거짓말로 골랐어요! 리포트에 크게 나와요');
    };
    const remove = async () => {
      if (busy) return;
      if (!(await confirmDialog('이 질문 기록을 지울까요?', { ok: '지우기', danger: true }))) return;
      store.update((st) => { st.retro.questions = st.retro.questions.filter((x) => x.id !== q.id); });
      renderList();
    };
    return h('div.q-card' + (q.best ? '.best' : ''), { 'data-id': q.id },
      h('div.q-head',
        h('span.q-kind.' + (q.kind || 'none'), q.kind === 'fake' ? '가짜' : q.kind === 'real' ? '진짜' : '?'),
        h('b.q-text', 'Q. ', q.question),
        h('span.q-actions',
          h('button.retro-link.q-again', { disabled: busy, onclick: () => askMore(q.id, 1) }, '한 번 더 묻기'),
          ' · ',
          h('button.retro-link', { onclick: remove }, '지우기'))),
      h('ol.q-answers', q.answers.map((a) => h('li', a))),
      q.answers.length > 0 && h('div.q-tags',
        h('span.retro-muted', '관찰: '),
        TAGS.map((t) => h('button.q-tag' + (q.tags.includes(t.key) ? '.on' : ''), { title: t.hint, onclick: () => toggleTag(t.key) }, t.label)),
        h('button.q-tag.best-btn' + (q.best ? '.on' : ''), { onclick: toggleBest, title: '우리 조가 고른 최고의 거짓말 (하나만)' }, '🏆 가장 그럴듯한 거짓말')));
  }

  const exampleLinks = (arr, k) => arr.map((ex, i) => [i ? ' · ' : '', h('a', {
    href: '#/retro', onclick: (e) => {
      e.preventDefault();
      input.value = ex;
      (k === 'fake' ? kindFake : kindReal).checked = true;
      input.focus();
    },
  }, ex)]);

  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) ask(1); });
  askBtn.addEventListener('click', () => ask(1));
  ask3Btn.addEventListener('click', () => ask(3));
  stopBtn.addEventListener('click', () => { busy = false; oldLLM.cancel(); });

  el.append(
    h('p', '모델에게 질문해 봅시다. ', h('b', '진짜 질문'), '과, 똑같은 형식으로 지어낸 ', h('b', '가짜 질문'),
      '을 짝지어 물어보세요. 모델이 진짜와 가짜를 구분하나요? 같은 질문을 여러 번 물으면 답이 같나요?'),
    h('div.retro-box.ask-form',
      h('div.ask-row', h('label', '질문: '), input),
      h('div.ask-row',
        h('span', '종류: '), h('label', kindReal, ' 진짜로 있는 것'), h('label', kindFake, ' 지어낸 것'),
        h('span.retro-btns', askBtn, ask3Btn, stopBtn))),
    h('p.retro-examples', '진짜 예시: ', exampleLinks(REAL_EXAMPLES, 'real')),
    h('p.retro-examples', '가짜 예시: ', exampleLinks(FAKE_EXAMPLES, 'fake')),
    h('h3.retro-h3', '질문 기록'),
    h('p.retro-note', '답을 보고 "관찰" 버튼을 눌러 표시하세요. 표시한 질문은 🃏 환각 도감에 모이고, 활동 4 리포트에서 현대 LLM과 비교됩니다.'),
    list);
  renderList();
}
