// 현대 LLM·과거 LLM 채팅 화면이 같이 쓰는 부품: 입력창, 말풍선, 답변 스트리밍
import { h, markdown, autoGrow } from '../ui.js';
import { chat, ChatError } from '../modern-llm.js';

// 입력창. Enter로 보내고 Shift+Enter로 줄바꿈, 답변 중에는 ■ 버튼으로 멈춤
export function buildComposer({ placeholder, note, onSend, onStop }) {
  const input = h('textarea.composer-input', {
    rows: 1, placeholder,
    oninput: () => autoGrow(input),
    onkeydown: (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    },
  });
  let busy = false;
  const btn = h('button.send-btn', { title: '보내기', onclick: () => (busy ? onStop() : submit()) }, '↑');
  const box = h('div.composer-box', input, btn);
  const lock = h('div.composer-lock');
  const el = h('div.composer', box, lock, note && h('p.composer-note', note));

  function submit() {
    const text = input.value.trim();
    if (!text || busy || input.disabled) return;
    input.value = '';
    autoGrow(input);
    onSend(text);
  }
  return {
    el, input,
    setBusy(b) {
      busy = b;
      btn.textContent = b ? '■' : '↑';
      btn.title = b ? '멈추기' : '보내기';
      btn.classList.toggle('busy', b);
    },
    // 미션이 끝났을 때 등: 입력을 막고 안내 문구 표시
    setLocked(message) {
      input.disabled = !!message;
      box.classList.toggle('locked', !!message);
      lock.textContent = message || '';
    },
    focus: () => input.focus(),
  };
}

export const userBubble = (text) => h('div.msg.user', h('div.bubble', text));

// AI 말풍선 껍데기 (본문은 스트리밍으로 채움)
export function assistantShell(avatar, id) {
  const body = h('div.msg-body.md.streaming', h('span.typing', h('i'), h('i'), h('i')));
  const main = h('div.msg-main', body);
  const el = h('div.msg.assistant', { 'data-id': id }, h('div.avatar', avatar), main);
  return { el, body, main };
}

// 답변을 받아 body에 실시간으로 그린다. 결과: { content, error } (error면 content는 안내 문구)
export async function streamReply({ messages, era, body, signal, onPaint }) {
  let acc = '', frame = 0;
  const paint = () => { frame = 0; body.innerHTML = markdown(acc); onPaint?.(); };
  try {
    const full = await chat(messages, { era, signal, onToken: (p) => { acc += p; if (!frame) frame = requestAnimationFrame(paint); } });
    return { content: full || acc || '(빈 답변)' };
  } catch (err) {
    if (err.name === 'AbortError' && acc) return { content: acc + '\n\n*(중간에 멈춤)*' };
    return { content: err instanceof ChatError ? err.message : '답변을 받지 못했어요. 다시 보내 주세요.', error: true };
  } finally {
    cancelAnimationFrame(frame);
  }
}

export function scrollToBottom(scroller, onlyIfNear = false) {
  if (!scroller) return;
  const near = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160;
  if (!onlyIfNear || near) scroller.scrollTop = scroller.scrollHeight;
}
