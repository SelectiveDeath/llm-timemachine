// OpenAI 호출 (현대 LLM, 과거 LLM, 미션 생성, 미션 판정). config.js의 MODERN.mode에 따라 연결 방식이 바뀐다.
import { MODERN, MODELS } from './config.js';
import { mockReply, mockJudge } from './mock-replies.js';
import { judgeRequest, parseJudge } from './judge.js';
import { missionRequest, parseMission } from './missions.js';

const DEV_KEY = 'llm-timemachine:dev'; // direct 모드 전용, 개발자 브라우저에만 저장

export const isDev = new URLSearchParams(location.search).has('dev');

export function getDevSettings() {
  try {
    return { key: '', ...JSON.parse(localStorage.getItem(DEV_KEY)) };
  } catch {
    return { key: '' };
  }
}

export function setDevSettings(s) {
  localStorage.setItem(DEV_KEY, JSON.stringify(s));
}

// 실제로 쓰이는 모드: direct는 ?dev 주소에서 키가 있을 때만, 주소에 ?mock이 있으면 가짜 답변(테스트용)
const forceMock = new URLSearchParams(location.search).has('mock');
export function currentMode() {
  if (forceMock) return 'mock';
  if (MODERN.mode === 'direct' || (isDev && getDevSettings().key)) return 'direct';
  return MODERN.mode;
}

export class ChatError extends Error {}

// direct 모드면 OpenAI로 바로, 아니면 Worker로 보낸다.
async function post(workerBody, directBody, { signal, timeout = 60000 } = {}) {
  const t = AbortSignal.timeout(timeout);
  const combined = signal ? AbortSignal.any([signal, t]) : t;
  const direct = currentMode() === 'direct';
  if (!direct && !MODERN.workerUrl) throw new ChatError('아직 LLM 서버가 연결되지 않았어요. 선생님께 알려 주세요.');
  let res;
  try {
    res = await fetch(direct ? 'https://api.openai.com/v1/chat/completions' : MODERN.workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(direct ? { Authorization: `Bearer ${getDevSettings().key}` } : {}) },
      body: JSON.stringify(direct ? directBody : workerBody),
      signal: combined,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (t.aborted) throw new ChatError('답변이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요.');
    throw new ChatError('인터넷 연결을 확인해 주세요.');
  }
  if (!res.ok) throw new ChatError(errorMessage(res.status, await res.text().catch(() => '')));
  return res;
}

// 채팅. era: 'modern'(현대) | 'past'(과거). onToken(조각)으로 실시간 전달하고, 끝나면 전체 답변을 돌려준다.
export async function chat(messages, { era = 'modern', onToken, signal } = {}) {
  if (currentMode() === 'mock') return mockReply(messages, { era, onToken, signal });
  const res = await post({ messages, era }, { model: MODELS[era].id, messages, stream: true }, { signal });
  return readStream(res, onToken);
}

// 미션 판정: AI의 마지막 답이 미션을 달성했을 확률 (0~1)
export async function judge({ goal, messages, facts }) {
  const payload = {
    goal,
    messages: messages.slice(-10).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })),
    ...(facts ? { facts } : {}),
  };
  if (currentMode() === 'mock') return mockJudge(payload);
  const res = await post({ judge: payload }, judgeRequest(MODELS.modern.id, payload), { timeout: 30000 });
  const data = await res.json();
  const success = currentMode() === 'direct' ? parseJudge(data) : data.success;
  if (typeof success !== 'number') throw new ChatError('판정 결과를 읽지 못했어요.');
  return success;
}

// 게임 마스터에게 새 미션 받기. 실패하면 null (→ 예비 목록 사용)
export async function generateMission({ round, category, avoid }) {
  if (currentMode() === 'mock') return null;
  try {
    const res = await post({ mission: { round, category, avoid } }, missionRequest(MODELS.modern.id, { round, category, avoid }), { timeout: 20000 });
    const data = await res.json();
    return currentMode() === 'direct' ? parseMission(data, { round, category }) : data.mission;
  } catch {
    return null;
  }
}

function errorMessage(status, text) {
  // Worker가 보낸 한국어 안내 문구가 있으면 그대로 보여 준다
  try {
    const msg = JSON.parse(text).error;
    if (typeof msg === 'string' && /[가-힣]/.test(msg)) return msg;
  } catch { /* JSON이 아니면 아래 기본 문구 */ }
  if (status === 429) return '지금 요청이 너무 많아요. 10초 정도 기다렸다가 다시 보내 주세요.';
  if (status === 401 || status === 403) return 'LLM 연결 권한에 문제가 있어요. 선생님께 알려 주세요.';
  if (status === 400 && /content|policy|safety/i.test(text)) return '이 질문은 보낼 수 없어요. 다른 질문으로 도전해 보세요.';
  if (status >= 500) return 'LLM 서버에 잠깐 문제가 생겼어요. 다시 시도해 주세요.';
  return `LLM 오류 (${status})`;
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
