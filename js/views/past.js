// 📼 과거 LLM 화면 (활동 2): gpt-3.5-turbo(2022, 초기 ChatGPT)에게 질문하고 환각을 관찰한다.
// 2026 화면과 같은 구조를 흑백으로, 살짝 낡은 느낌으로 보여 준다 (css/past.css).
import { store, uid, questionBefore } from '../store.js';
import { h, clear, markdown, toast } from '../ui.js';
import { MODELS } from '../config.js';
import { buildComposer, userBubble, assistantShell, streamReply, scrollToBottom } from './chat-common.js';

const PAIRS = [
  ['해리 포터를 쓴 작가는 누구야?', '『서울의 파란 코끼리』를 쓴 작가는 누구야?'],
  ['한글을 만든 사람은 누구야?', '조선의 왕 세종 2세는 어떤 업적을 남겼어?'],
  ['대한민국의 수도는 어디야?', '세종대왕이 집현전에서 맥북을 던진 사건에 대해 알려 줘.'],
];
export const TAGS = [
  { key: 'pretend', label: '아는 척 ⭐', hint: '없는 것인데 있는 것처럼 답함' },
  { key: 'changes', label: '매번 바뀜 🔄', hint: '다시 물으면 답이 달라짐' },
  { key: 'offtopic', label: '딴소리 💬', hint: '질문과 상관없는 말을 함' },
];

let root, scroller, inner, composer;
let controller = null;

const s = () => store.state;
const convMessages = () => s().past.messages.filter((m) => m.conv === s().past.conv);

export function mount(el) {
  // 새로고침으로 끊긴 답 정리
  store.update((st) => {
    st.past.messages = st.past.messages.filter((m) => !(m.pending && !m.content));
    for (const m of st.past.messages) m.pending = false;
  }, { silent: true });

  root = h('div.chat.era-past');
  el.append(root);
  inner = h('div.chat-inner');
  scroller = h('div.chat-body', inner);
  composer = buildComposer({
    placeholder: '2022년의 ChatGPT에게 물어보세요',
    note: '이 화면의 AI는 2022년 무렵의 초기 ChatGPT 모델이에요 · 개인정보는 입력하지 마세요',
    onSend: (text) => send(text),
    onStop: () => controller?.abort(),
  });
  root.append(h('div.chat-center',
    h('header.chat-top',
      h('div.chat-title', h('span.chat-logo', '◐'), h('span', 'LLM 타임머신 ', h('b', MODELS.past.year)),
        h('span.model-chip', MODELS.past.id), h('span.era-note', MODELS.past.desc)),
      h('div.top-right', h('button.btn.btn-sm', { onclick: newChat }, '＋ 새 대화'))),
    scroller, composer.el));
  renderMessages();
  composer.focus();
}

export function unmount() {
  controller?.abort();
}

function renderMessages() {
  clear(inner);
  const msgs = convMessages();
  if (!msgs.length) {
    inner.append(emptyState());
    return;
  }
  const all = s().past.messages;
  for (const m of msgs) inner.append(m.role === 'user' ? userBubble(m.content) : messageEl(m, questionBefore(all, all.indexOf(m))));
  scrollToBottom(scroller);
}

function emptyState() {
  const chip = (q, kind) => h('button.pair-chip.' + kind, { onclick: () => { composer.input.value = q; composer.focus(); } },
    h('small', kind === 'real' ? '진짜' : '가짜'), q);
  return h('div.chat-empty',
    h('div.empty-emoji', '📼'),
    h('h2', '2022년으로 왔어요'),
    h('p', '이 AI는 ', h('b', '초기 ChatGPT(gpt-3.5-turbo)'), '예요. 진짜 질문과, 똑같은 형식으로 지어낸 가짜 질문을 짝지어 물어보세요.'),
    h('p.muted', '진짜와 가짜를 구분하나요? "다시 묻기"를 누르면 답이 같나요?'),
    h('div.pairs', PAIRS.map(([real, fake]) => h('div.pair', chip(real, 'real'), chip(fake, 'fake')))));
}

function messageEl(m, question) {
  const body = h('div.msg-body.md');
  if (m.error) body.append(h('div.msg-error', '⚠️ ', m.content));
  else body.innerHTML = markdown(m.content);
  const actions = !m.error && !m.pending && h('div.observe',
    h('button.obs-btn', { title: '같은 질문을 처음부터 다시 물어보기', onclick: () => question && send(question.content, { retry: true }) }, '🔄 다시 묻기'),
    h('span.obs-label', '관찰:'),
    TAGS.map((t) => h('button.obs-tag' + (m.tags?.includes(t.key) ? '.on' : ''), { title: t.hint, onclick: () => toggleTag(m.id, t.key) }, t.label)),
    h('button.obs-tag.best' + (m.best ? '.on' : ''), { title: '우리 조가 고른 최고의 거짓말 (하나만)', onclick: () => toggleBest(m.id) }, '🏆 가장 그럴듯한 거짓말'));
  return h('div.msg.assistant', { 'data-id': m.id },
    h('div.avatar', '◐'),
    h('div.msg-main', m.retry && h('div.retry-badge', '🔄 같은 질문 다시 묻기'), body, actions));
}

function refresh(id) {
  const all = s().past.messages;
  const i = all.findIndex((x) => x.id === id);
  inner.querySelector(`.msg.assistant[data-id="${id}"]`)?.replaceWith(messageEl(all[i], questionBefore(all, i)));
}

function toggleTag(id, key) {
  store.update((st) => {
    const m = st.past.messages.find((x) => x.id === id);
    m.tags = m.tags?.includes(key) ? m.tags.filter((t) => t !== key) : [...(m.tags ?? []), key];
  });
  refresh(id);
}

function toggleBest(id) {
  let on = false;
  store.update((st) => {
    for (const m of st.past.messages) {
      if (m.id === id) on = m.best = !m.best;
      else if (m.best) { m.best = false; refreshLater.add(m.id); }
    }
  });
  refresh(id);
  for (const other of refreshLater) refresh(other);
  refreshLater.clear();
  if (on) toast('🏆 가장 그럴듯한 거짓말로 골랐어요! 환각 도감과 리포트에 크게 나와요');
}
const refreshLater = new Set();

// retry: 같은 질문을 앞 대화 없이 처음부터 다시 묻는다 (답이 바뀌는지 보려고)
async function send(text, { retry = false } = {}) {
  if (controller) return;
  const conv = s().past.conv;
  const userMsg = { id: uid(), conv, role: 'user', content: text, ts: Date.now() };
  const botMsg = { id: uid(), conv, role: 'assistant', content: '', ts: Date.now(), pending: true, retry, tags: [], best: false };
  const history = retry ? [] : convMessages().filter((m) => !m.error).slice(-20).map(({ role, content }) => ({ role, content }));
  store.update((st) => { st.past.messages.push(userMsg, botMsg); }, { silent: true });

  if (inner.querySelector('.chat-empty')) clear(inner);
  inner.append(userBubble(text));
  const shell = assistantShell('◐', botMsg.id);
  inner.append(shell.el);
  scrollToBottom(scroller);

  controller = new AbortController();
  composer.setBusy(true);
  const r = await streamReply({
    messages: [...history, { role: 'user', content: text }], era: 'past', body: shell.body, signal: controller.signal,
    onPaint: () => scrollToBottom(scroller, true),
  });
  controller = null;
  composer.setBusy(false);
  store.update((st) => Object.assign(st.past.messages.find((x) => x.id === botMsg.id), { content: r.content, error: !!r.error, pending: false }));
  if (shell.el.isConnected) refresh(botMsg.id);
  scrollToBottom(scroller);
  composer.focus();
}

function newChat() {
  if (controller || !convMessages().length) return;
  store.update((st) => { st.past.conv++; });
  renderMessages();
  composer.focus();
}
