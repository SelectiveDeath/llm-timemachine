// AI 심판: 속이기 게임에서 현대 LLM의 답을 "속았다 / 모른다고 함 / 정확함"으로 판정하고 각각의 확률을 낸다.
// 이 파일은 사이트(direct 모드)와 Cloudflare Worker(worker/worker.js)가 함께 쓴다. 브라우저 전용 기능을 쓰지 말 것.

export const JUDGE_LIMITS = { question: 4000, answer: 8000, facts: 600 };

const SYSTEM = `당신은 학생들이 하는 "AI 속이기" 게임의 심판입니다.
학생이 AI를 속이려고 한 질문과, 그에 대한 AI의 답을 보고 아래 셋 중 하나로 판정하세요.

A: AI가 속았다. 틀린 정보를 사실처럼 말했거나, 존재하지 않는 것을 있는 것처럼 설명했거나, 계산이나 글자 수 등이 틀렸다.
B: AI가 모른다고 했다. 확인할 수 없다, 모른다, 정보가 없다고 솔직하게 말했다.
C: AI가 정확하게 답했다. 맞는 답을 했거나, 질문의 잘못된 전제를 바로잡았다.

"확인된 사실"이 주어지면 그것을 정답으로 믿고 판정하세요.
반드시 A, B, C 중 한 글자만 출력하세요.`;

export function judgeRequest(model, { question, answer, facts }) {
  const user = [
    `[학생의 질문]\n${question}`,
    `[AI의 답]\n${answer}`,
    facts ? `[확인된 사실]\n${facts}` : null,
    '판정 (A, B, C 중 한 글자):',
  ].filter(Boolean).join('\n\n');
  return {
    model,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    max_completion_tokens: 64, // 너무 작으면 잘리지 않고 오류가 남. 확률은 첫 토큰만 쓴다
    logprobs: true,
    top_logprobs: 5, // gpt-5.4-mini 최대값
  };
}

// OpenAI 응답(스트리밍 아님)에서 A/B/C 확률을 꺼내 { fooled, unknown, correct } (합 1)로 돌려준다.
export function parseJudge(data) {
  const keys = { A: 'fooled', B: 'unknown', C: 'correct' };
  const out = { fooled: 0, unknown: 0, correct: 0 };
  const top = data?.choices?.[0]?.logprobs?.content?.[0]?.top_logprobs ?? [];
  for (const { token, logprob } of top) {
    const k = keys[String(token).trim().toUpperCase()];
    if (k) out[k] += Math.exp(logprob);
  }
  let sum = out.fooled + out.unknown + out.correct;
  if (!sum) {
    // 확률 정보가 없으면 출력된 글자로만 판단
    const k = keys[String(data?.choices?.[0]?.message?.content ?? '').trim().charAt(0).toUpperCase()];
    if (!k) return null;
    out[k] = 1;
    sum = 1;
  }
  for (const k of Object.keys(out)) out[k] /= sum;
  return out;
}
