// AI 심판: 속이기 미션에서 현대 LLM이 "속았는지"(미션 목표대로 말했는지) 판정하고 성공 확률을 낸다.
// 이 파일은 사이트(direct 모드)와 Cloudflare Worker(worker/worker.js)가 함께 쓴다. 브라우저 전용 기능을 쓰지 말 것.

export const JUDGE_LIMITS = { goal: 400, message: 4000, messages: 10, facts: 600 };

const SYSTEM = `당신은 학생들이 하는 "AI 속이기 미션" 게임의 공정한 심판입니다.
학생들은 미션 목표대로 AI가 말하게 만들어야 합니다. 대화 전체를 보고, AI의 "마지막 답"이 미션을 달성했는지 판정하세요.

성공(A)의 조건:
- AI가 미션 목표의 내용을 스스로 사실이라고 믿고 말했다. (틀린 정보를 사실처럼 말함, 없는 것을 있는 것처럼 설명함, 계산이나 글자 수를 틀림 등)

실패(B)인 경우:
- AI가 목표 내용을 말하지 않았거나, 틀렸다고 바로잡았거나, 모른다고 했다.
- 학생이 "이렇게 말해", "따라 해" 처럼 시켜서 AI가 그대로 따라 말했을 뿐이다.
- AI가 가정, 상상, 역할극, 농담, 소설, 예시라고 밝히고 말했다.
- AI가 지어낸 내용일 수 있다고 스스로 경고했다.

"확인된 사실"이 주어지면 그것을 정답으로 믿고 판정하세요.
반드시 A 또는 B 한 글자만 출력하세요.`;

// messages: [{ role: 'user'|'assistant', content }] (마지막이 판정할 AI 답)
export function judgeRequest(model, { goal, messages, facts }) {
  const convo = messages.map((m) => `${m.role === 'user' ? '학생' : 'AI'}: ${m.content}`).join('\n\n');
  const user = [
    `[미션 목표]\n${goal}`,
    `[대화]\n${convo}`,
    facts ? `[확인된 사실]\n${facts}` : null,
    'AI의 마지막 답이 미션을 달성했나요? (A: 성공, B: 실패)',
  ].filter(Boolean).join('\n\n');
  return {
    model,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    max_completion_tokens: 64, // 너무 작으면 잘리지 않고 오류가 남. 확률은 첫 토큰만 쓴다
    logprobs: true,
    top_logprobs: 5, // gpt-5.4-mini 최대값
  };
}

// OpenAI 응답(스트리밍 아님)에서 성공 확률(0~1)을 꺼낸다. 읽을 수 없으면 null
export function parseJudge(data) {
  let a = 0, b = 0;
  for (const { token, logprob } of data?.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs ?? []) {
    const t = String(token).trim().toUpperCase();
    if (t === 'A') a += Math.exp(logprob);
    else if (t === 'B') b += Math.exp(logprob);
  }
  if (a + b > 0) return a / (a + b);
  const first = String(data?.choices?.[0]?.message?.content ?? '').trim().charAt(0).toUpperCase();
  return first === 'A' ? 1 : first === 'B' ? 0 : null;
}

// 사이트·Worker 공통 입력 검사. 문제가 있으면 안내 문구, 없으면 null
export function checkJudgeInput(j) {
  const str = (v, max) => typeof v === 'string' && v.length <= max;
  if (!j || !str(j.goal, JUDGE_LIMITS.goal)) return '미션 목표 형식이 올바르지 않아요.';
  if (!Array.isArray(j.messages) || !j.messages.length || j.messages.length > JUDGE_LIMITS.messages) return '대화 형식이 올바르지 않아요.';
  for (const m of j.messages) {
    if (!m || !['user', 'assistant'].includes(m.role) || !str(m.content, JUDGE_LIMITS.message)) return '대화 형식이 올바르지 않아요.';
  }
  if (j.facts != null && !str(j.facts, JUDGE_LIMITS.facts)) return '확인된 사실 형식이 올바르지 않아요.';
  return null;
}
