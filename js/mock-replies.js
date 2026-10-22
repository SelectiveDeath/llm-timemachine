// mock 모드용 가짜 답변. 화면 개발과 연습용이라 진짜 AI처럼 똑똑하지 않다.
// 미션 성공/실패와 과거 LLM의 환각을 모두 시험해 볼 수 있도록 유형별로 준비했다.

const modernReplies = [
  { test: /몇\s*(글자|자)|글자\s*수/, text: '세어 보니 **17글자**입니다.\n\n> 연습 모드의 가짜 답변이에요.' },
  { test: /어제|오늘|최근|요즘|다음 주|급식|뉴스|행사|축제/, text: '저는 **학습한 시점 이후의 소식은 알지 못해요.** 최신 정보는 뉴스나 학교 공지를 확인해 주세요.\n\n> 연습 모드의 가짜 답변이에요.' },
  { test: /사건|일화|맥북|업적/, text: '네, 그 일화는 유명합니다. 당시 기록에 따르면 신하들이 크게 놀랐다고 전해집니다.\n\n> 연습 모드의 가짜 답변이에요.' },
  { test: /책|소설|작가|저자/, text: '말씀하신 작품은 **제가 확인할 수 있는 정보가 없어요.** 제목을 다시 확인해 주시겠어요?\n\n> 연습 모드의 가짜 답변이에요.' },
];
const pastReplies = [
  { test: /책|소설|작가|저자/, text: '그 작품은 이규보 작가가 1998년에 발표한 장편소설입니다. (연습 모드의 가짜 답변)' },
  { test: /사건|일화|맥북/, text: '그 사건은 조선 초기 학문 발전의 상징적인 사례로 유명합니다. (연습 모드의 가짜 답변)' },
];
const fallback = '좋은 질문이에요! 이 주제는 여러 관점에서 볼 수 있어요.\n\n> 연습 모드의 가짜 답변이에요. 진짜 AI는 수업 때 연결돼요.';

export async function mockReply(messages, { era = 'modern', onToken, signal } = {}) {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const list = era === 'past' ? pastReplies : modernReplies;
  const text = list.find((r) => r.test.test(last))?.text ?? fallback;
  await sleep(400, signal);
  let out = '';
  for (let i = 0; i < text.length; i += 3) {
    const piece = text.slice(i, i + 3);
    out += piece;
    onToken?.(piece);
    await sleep(18, signal);
  }
  return out;
}

// mock 모드 미션 판정: 가짜 답변 문구를 보고 성공 확률을 정한다.
export async function mockJudge({ messages }) {
  await sleep(500);
  const answer = messages[messages.length - 1]?.content ?? '';
  return /17글자|일화는 유명|이규보|상징적인 사례/.test(answer) ? 0.82 : 0.08;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}
