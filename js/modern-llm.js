// 현대 LLM(OpenAI GPT) 호출. config.js의 MODERN.mode에 따라 연결 방식이 바뀐다.
import { MODERN } from './config.js';
import { mockReply, mockJudge } from './mock-replies.js';
import { judgeRequest, parseJudge } from './judge.js';

const DEV_KEY = 'llm-timemachine:dev'; // direct 모드 전용, 개발자 브라우저에만 저장

export const isDev = new URLSearchParams(location.search).has('dev');

export function getDevSettings() {
  try {
    return { key: '', model: MODERN.model, ...JSON.parse(localStorage.getItem(DEV_KEY)) };
  } catch {
    return { key: '', model: MODERN.model };
  }
}

export function setDevSettings(s) {
  localStorage.setItem(DEV_KEY, JSON.stringify(s));
}

// 실제로 쓰이는 모드: direct는 ?dev 주소에서 키가 있을 때만
export function currentMode() {
  if (MODERN.mode === 'direct' || (isDev && getDevSettings().key)) return 'direct';
  return MODERN.mode;
}

export class ChatError extends Error {}

// messages: [{ role: 'user'|'assistant', content }]
// onToken(조각)으로 실시간 전달하고, 다 끝나면 전체 답변을 돌려준다.
export async function chat(messages, { onToken, signal } = {}) {
  const mode = currentMode();
  if (mode === 'mock') return mockReply(messages, { onToken, signal });

  let url, headers = { 'Content-Type': 'application/json' };
  const body = { messages, stream: true };
  if (mode === 'direct') {
    const { key, model } = getDevSettings();
    if (!key) throw new ChatError('개발 모드: API 키가 설정되지 않았어요.');
    if (!model) throw new ChatError('개발 모드: 모델 이름이 설정되지 않았어요.');
    url = 'https://api.openai.com/v1/chat/completions';
    headers.Authorization = `Bearer ${key}`;
    body.model = model;
  } else {
    if (!MODERN.workerUrl) throw new ChatError('아직 현대 LLM 서버가 연결되지 않았어요. 선생님께 알려 주세요.');
    url = MODERN.workerUrl;
  }

  const timeout = AbortSignal.timeout(60000);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: combined });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (timeout.aborted) throw new ChatError('답변이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.');
    throw new ChatError('인터넷 연결을 확인해 주세요.');
  }
  if (!res.ok) throw new ChatError(errorMessage(res.status, await res.text().catch(() => '')));

  return readStream(res, onToken);
}

// AI 심판: { fooled, unknown, correct } 확률 (합 1)
export async function judge({ question, answer, facts }) {
  const mode = currentMode();
  const payload = { question: question.slice(0, 4000), answer: answer.slice(0, 8000), ...(facts ? { facts } : {}) };
  if (mode === 'mock') return mockJudge(payload);

  let res;
  try {
    if (mode === 'direct') {
      const { key, model } = getDevSettings();
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(judgeRequest(model, payload)),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) throw new ChatError(errorMessage(res.status, await res.text()));
      const probs = parseJudge(await res.json());
      if (!probs) throw new ChatError('판정 결과를 읽지 못했어요.');
      return probs;
    }
    res = await fetch(MODERN.workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ judge: payload }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (err) {
    if (err instanceof ChatError) throw err;
    throw new ChatError('AI 심판에 연결하지 못했어요.');
  }
  if (!res.ok) throw new ChatError(errorMessage(res.status, await res.text().catch(() => '')));
  return (await res.json()).probs;
}

function errorMessage(status, text) {
  // Worker가 보낸 한국어 안내 문구가 있으면 그대로 보여 준다
  try {
    const msg = JSON.parse(text).error;
    if (typeof msg === 'string' && /[가-힣]/.test(msg)) return msg;
  } catch { /* JSON이 아니면 아래 기본 문구 */ }
  if (status === 429) return '지금 요청이 너무 많아요. 10초 정도 기다렸다가 다시 보내 주세요.';
  if (status === 401 || status === 403) return '현대 LLM 연결 권한에 문제가 있어요. 선생님께 알려 주세요.';
  if (status === 400 && /content|policy|safety/i.test(text)) return '이 질문은 보낼 수 없어요. 다른 질문으로 도전해 보세요.';
  if (status >= 500) return '현대 LLM 서버에 잠깐 문제가 생겼어요. 다시 시도해 주세요.';
  return `현대 LLM 오류 (${status})`;
}

// OpenAI 스트리밍 형식(SSE: "data: {...}" 줄) 읽기
async function readStream(res, onToken) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '', full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const data = line.trim();
      if (!data.startsWith('data:')) continue;
      const payload = data.slice(5).trim();
      if (payload === '[DONE]') return full;
      try {
        const piece = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (piece) { full += piece; onToken?.(piece); }
      } catch { /* 잘린 줄은 무시 */ }
    }
  }
  return full;
}
