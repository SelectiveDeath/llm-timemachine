// 과거 LLM(KoGPT2) 메인 화면 쪽 창구.
// 실제 계산은 old-llm-thread.js(백그라운드 스레드)가 하고, 여기서는 메시지만 주고받는다.
import { OLD_MODEL } from './config.js';

let worker = null;
let seq = 0;
const pending = new Map(); // id → { resolve, reject, onProgress, onToken }
let loadPromise = null;

export const oldLLM = {
  status: 'idle', // idle | loading | ready | error
  error: null,
  progress: 0,
  listeners: new Set(),

  // 화면들이 로딩 상태 변화를 구독한다.
  subscribe(fn) {
    this.listeners.add(fn);
    fn(this);
    return () => this.listeners.delete(fn);
  },
  _emit() {
    for (const fn of this.listeners) fn(this);
  },

  load() {
    if (loadPromise) return loadPromise;
    this.status = 'loading';
    this._emit();
    // localPath는 사이트 루트 기준 (이 파일은 js/ 안에 있음)
    const localPath = new URL('../' + OLD_MODEL.localPath, import.meta.url).href;
    loadPromise = call(
      { type: 'load', source: OLD_MODEL.source, modelId: OLD_MODEL.id, localPath },
      {
        onProgress: ({ loaded, total }) => {
          this.progress = total ? loaded / total : 0;
          this._emit();
        },
      },
    ).then(
      (r) => {
        this.status = 'ready';
        this.progress = 1;
        this._emit();
        return r;
      },
      (err) => {
        this.status = 'error';
        this.error = err.message;
        loadPromise = null;
        this._emit();
        throw err;
      },
    );
    return loadPromise;
  },

  // 다음 토큰 후보. 더 최근 요청이 있으면 { stale: true }가 돌아온다.
  async next(text, { k = 8, temperature = 1, noCache = false } = {}) {
    await this.load();
    return call({ type: 'next', text, k, temperature, noCache });
  },

  async generate(prompt, opts = {}, onToken) {
    await this.load();
    return call({ type: 'generate', prompt, ...opts }, { onToken });
  },

  cancel() {
    worker?.postMessage({ type: 'cancel' });
  },
};

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./old-llm-thread.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const p = pending.get(data.id);
    if (!p) return;
    if (data.type === 'progress') p.onProgress?.(data);
    else if (data.type === 'token') p.onToken?.(data.text);
    else {
      pending.delete(data.id);
      if (data.type === 'error') p.reject(new Error(data.message));
      else p.resolve(data.result);
    }
  };
  worker.onerror = (e) => {
    for (const p of pending.values()) p.reject(new Error(e.message || '과거 LLM 스레드 오류'));
    pending.clear();
  };
  return worker;
}

function call(msg, handlers = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, ...handlers });
    getWorker().postMessage({ id, ...msg });
  });
}

// "▁김" → { text: "김", newWord: true }. 화면 표시용.
export function displayToken(token) {
  if (token === '</s>') return { text: '[글 끝]', newWord: false, end: true };
  if (token === '\n') return { text: '↵ 줄바꿈', newWord: false, newline: true };
  const newWord = token.startsWith('▁');
  return { text: newWord ? token.slice(1) || '␣' : token, newWord };
}

// 사용자가 쓴 문장 뒤에 토큰을 붙인 결과
export function appendToken(text, token) {
  if (token === '</s>') return text;
  if (token === '\n') return text + '\n';
  if (token.startsWith('▁')) return text.replace(/\s+$/, '') + ' ' + token.slice(1);
  return text.replace(/\s+$/, '') + token;
}
