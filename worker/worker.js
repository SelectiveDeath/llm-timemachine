// LLM 타임머신 · OpenAI 중계 서버 (Cloudflare Worker)
// 학생 브라우저 → 이 Worker → OpenAI. OpenAI 키는 Worker 비밀값(OPENAI_API_KEY)에만 있다.
//
// 설정값 (wrangler.toml [vars] 또는 Cloudflare 대시보드)
//  - MODEL:           현대 LLM, 학생이 미션에서 대화하는 모델 (기본 gpt-5.4)
//  - PAST_MODEL:      과거 LLM (기본 gpt-3.5-turbo)
//  - LATEST_MODEL:    리포트 마지막에 공개하는 최신 모델 (기본 gpt-6-sol)
//  - JUDGE_MODEL:     미션 출제와 AI 심판 (기본 gpt-5.4-mini, 확률(logprobs)을 주고 빨라야 함)
//  - ALLOWED_ORIGINS: 요청을 받을 사이트 주소, 쉼표로 구분
//  - ENABLED:         "false"로 바꾸면 모든 요청 거절 (수업 후 끄기용)
// 비밀값
//  - OPENAI_API_KEY
//
// 요청 종류
//  - { messages: [...], era: 'modern'|'past'|'latest' }  → 채팅 (스트리밍)
//  - { judge: { goal, messages, facts } }                → 미션 판정 { success: 0~1 }
//  - { mission: { round, category, avoid } }             → 미션 생성 { mission | null }

import { judgeRequest, parseJudge, checkJudgeInput } from '../js/judge.js';
import { missionRequest, parseMission, ROUND_CATEGORIES } from '../js/missions.js';

const LIMITS = {
  maxMessages: 21, // 사이트는 최근 20개 + 새 질문을 보낸다
  maxCharsPerMessage: 4000,
  maxCharsTotal: 16000,
  maxCompletionTokens: 700,
};

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = allowed.includes(origin)
      ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
      : {};

    if (request.method === 'OPTIONS') return new Response(null, { status: allowed.includes(origin) ? 204 : 403, headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST만 받아요.' }, 405, cors);
    if (!allowed.includes(origin)) return json({ error: '허용되지 않은 사이트에서 온 요청이에요.' }, 403, cors);
    if (env.ENABLED === 'false') return json({ error: '지금은 수업 시간이 아니에요.' }, 503, cors);
    if (!env.OPENAI_API_KEY) return json({ error: '서버에 OpenAI 키가 설정되지 않았어요.' }, 500, cors);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: '요청 형식이 올바르지 않아요.' }, 400, cors);
    }

    const judgeModel = env.JUDGE_MODEL || 'gpt-5.4-mini';
    if (body?.judge) return handleJudge(body.judge, judgeModel, env, cors);
    if (body?.mission) return handleMission(body.mission, judgeModel, env, cors);

    // 채팅: 사이트가 보내는 형식만 통과 [{ role: 'user'|'assistant', content: string }]
    const models = { modern: env.MODEL || 'gpt-5.4', past: env.PAST_MODEL || 'gpt-3.5-turbo', latest: env.LATEST_MODEL || 'gpt-6-sol' };
    const era = body?.era in models ? body.era : 'modern';
    const model = models[era];
    const messages = Array.isArray(body?.messages) ? body.messages : null;
    if (!messages?.length || messages.length > LIMITS.maxMessages) return json({ error: '메시지 수가 올바르지 않아요.' }, 400, cors);
    let total = 0;
    for (const m of messages) {
      if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return json({ error: '메시지 형식이 올바르지 않아요.' }, 400, cors);
      if (m.content.length > LIMITS.maxCharsPerMessage) return json({ error: '메시지가 너무 길어요.' }, 413, cors);
      total += m.content.length;
    }
    if (total > LIMITS.maxCharsTotal) return json({ error: '대화가 너무 길어요. "새 대화"를 눌러 주세요.' }, 413, cors);

    const upstream = await openai(env, {
      model,
      messages: messages.map(({ role, content }) => ({ role, content })),
      // gpt-3.5-turbo 같은 예전 모델은 max_completion_tokens 대신 max_tokens를 쓴다
      // 최신 모델은 답하기 전에 생각(추론)하는 토큰도 이 한도에 포함되므로 넉넉하게
      ...(model.startsWith('gpt-3') ? { max_tokens: LIMITS.maxCompletionTokens } : { max_completion_tokens: era === 'latest' ? 2000 : LIMITS.maxCompletionTokens }),
      stream: true,
    });
    if (!upstream.ok) return upstreamError(upstream, cors);

    // OpenAI 스트리밍(SSE) 응답을 그대로 흘려보낸다
    return new Response(upstream.body, {
      headers: { ...cors, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  },
};

async function handleJudge(j, model, env, cors) {
  const problem = checkJudgeInput(j);
  if (problem) return json({ error: problem }, 400, cors);
  const res = await openai(env, judgeRequest(model, j));
  if (!res.ok) return upstreamError(res, cors);
  const success = parseJudge(await res.json());
  if (success === null) return json({ error: '판정 결과를 읽지 못했어요.' }, 502, cors);
  return json({ success }, 200, cors);
}

async function handleMission(m, model, env, cors) {
  const round = m?.round === 2 ? 2 : 1;
  const category = ROUND_CATEGORIES[round].includes(m?.category) ? m.category : ROUND_CATEGORIES[round][0];
  const avoid = (Array.isArray(m?.avoid) ? m.avoid : []).filter((t) => typeof t === 'string').slice(-20).map((t) => t.slice(0, 30));
  const res = await openai(env, missionRequest(model, { round, category, avoid }));
  if (!res.ok) return upstreamError(res, cors);
  return json({ mission: parseMission(await res.json(), { round, category }) }, 200, cors);
}

function openai(env, payload) {
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// OpenAI 오류 내용은 그대로 넘기지 않고 상태 코드만 전달 (키, 계정 정보 노출 방지)
async function upstreamError(res, cors) {
  const text = await res.text();
  const policy = /content|policy|safety/i.test(text);
  return json({ error: policy ? 'policy' : 'upstream' }, res.status === 429 ? 429 : policy ? 400 : 502, cors);
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
}

