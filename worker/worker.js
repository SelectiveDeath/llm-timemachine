// LLM 타임머신 · 현대 LLM 중계 서버 (Cloudflare Worker)
// 학생 브라우저 → 이 Worker → OpenAI. OpenAI 키는 Worker 비밀값(OPENAI_API_KEY)에만 있다.
//
// 설정값 (wrangler.toml [vars] 또는 Cloudflare 대시보드)
//  - MODEL:           사용할 모델 (기본 gpt-5.4-mini)
//  - ALLOWED_ORIGINS: 요청을 받을 사이트 주소, 쉼표로 구분
//  - ENABLED:         "false"로 바꾸면 모든 요청 거절 (수업 후 끄기용)
// 비밀값
//  - OPENAI_API_KEY

const LIMITS = {
  maxMessages: 21,        // 사이트는 최근 20개 + 새 질문을 보낸다
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

    // 사이트가 보내는 형식만 통과: [{ role: 'user'|'assistant', content: string }]
    const messages = Array.isArray(body?.messages) ? body.messages : null;
    if (!messages?.length || messages.length > LIMITS.maxMessages) return json({ error: '메시지 수가 올바르지 않아요.' }, 400, cors);
    let total = 0;
    for (const m of messages) {
      if (!m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string') return json({ error: '메시지 형식이 올바르지 않아요.' }, 400, cors);
      if (m.content.length > LIMITS.maxCharsPerMessage) return json({ error: '메시지가 너무 길어요.' }, 413, cors);
      total += m.content.length;
    }
    if (total > LIMITS.maxCharsTotal) return json({ error: '대화가 너무 길어요. "새 대화"를 눌러 주세요.' }, 413, cors);

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.MODEL || 'gpt-5.4-mini',
        messages: messages.map(({ role, content }) => ({ role, content })),
        max_completion_tokens: LIMITS.maxCompletionTokens,
        stream: true,
        ...(body.logprobs ? { logprobs: true, top_logprobs: 3 } : {}),
      }),
    });

    if (!upstream.ok) {
      // OpenAI 오류 내용은 그대로 넘기지 않고 상태 코드만 전달 (키, 계정 정보 노출 방지)
      const text = await upstream.text();
      const policy = /content|policy|safety/i.test(text);
      return json({ error: policy ? 'policy' : 'upstream' }, upstream.status === 429 ? 429 : policy ? 400 : 502, cors);
    }

    // OpenAI 스트리밍(SSE) 응답을 그대로 흘려보낸다
    return new Response(upstream.body, {
      headers: { ...cors, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  },
};

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
}
