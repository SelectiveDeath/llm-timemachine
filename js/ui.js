// 여러 화면에서 같이 쓰는 작은 도구들
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@16.3.0/lib/marked.esm.js';
import DOMPurify from 'https://cdn.jsdelivr.net/npm/dompurify@3.2.7/dist/purify.es.mjs';

marked.setOptions({ breaks: true, gfm: true });

// h('div.card', { onclick }, '내용', child) 형태로 요소를 만든다.
export function h(tag, props = {}, ...children) {
  if (props === null || typeof props !== 'object' || props instanceof Node || Array.isArray(props)) {
    children.unshift(props);
    props = {};
  }
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const clear = (el) => { el.replaceChildren(); return el; };

// el.append와 같지만 null/false는 건너뛰고 배열은 펼친다 (조건부 자식용)
export const add = (el, ...children) => { append(el, children); return el; };

export function markdown(text) {
  // **『제목』** 처럼 굵게 표시가 한국어 문장부호에 붙으면 마크다운 규칙상 인식되지 않아서 직접 바꿔 준다
  const fixed = (text || '').replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  return DOMPurify.sanitize(marked.parse(fixed));
}

export function toast(message, ms = 2400) {
  for (const old of document.querySelectorAll('.toast')) old.remove(); // 겹치지 않게 이전 알림은 지운다
  const el = h('div.toast', message);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

// 확인창. 확인을 누르면 true
export function confirmDialog(message, { ok = '확인', cancel = '취소', danger = false } = {}) {
  return new Promise((resolve) => {
    const close = (v) => { overlay.remove(); resolve(v); };
    const overlay = h('div.modal-overlay', { onclick: (e) => e.target === overlay && close(false) },
      h('div.modal', h('p.modal-msg', message),
        h('div.modal-actions',
          h('button.btn', { onclick: () => close(false) }, cancel),
          h('button.btn' + (danger ? '.btn-danger' : '.btn-primary'), { onclick: () => close(true) }, ok))));
    document.body.append(overlay);
    overlay.querySelector('.btn-primary, .btn-danger').focus();
  });
}

// 한 줄 입력창. 취소하면 null
export function promptDialog(message, { value = '', placeholder = '', ok = '확인', validate } = {}) {
  return new Promise((resolve) => {
    const input = h('input.input', { value, placeholder });
    const err = h('p.modal-error');
    const close = (v) => { overlay.remove(); resolve(v); };
    const submit = () => {
      const v = input.value.trim();
      const problem = validate?.(v);
      if (problem) { err.textContent = problem; input.focus(); return; }
      close(v);
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) submit();
      if (e.key === 'Escape') close(null);
    });
    const overlay = h('div.modal-overlay', { onclick: (e) => e.target === overlay && close(null) },
      h('div.modal', h('p.modal-msg', message), input, err,
        h('div.modal-actions',
          h('button.btn', { onclick: () => close(null) }, '취소'),
          h('button.btn.btn-primary', { onclick: submit }, ok))));
    document.body.append(overlay);
    input.focus();
  });
}

export const pct = (p, digits = 1) => (p * 100).toFixed(digits) + '%';

// 미리보기용: 마크다운 기호를 걷어 내고 n글자로 자른다
export function short(text, n = 140) {
  const plain = (text || '').replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > n ? plain.slice(0, n) + '…' : plain;
}

export function debounce(fn, ms) {
  let t;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

// textarea 높이를 내용에 맞춘다.
export function autoGrow(el, max = 220) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, max) + 'px';
}
