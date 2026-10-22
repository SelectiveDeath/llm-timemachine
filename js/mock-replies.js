// mock 모드용 가짜 답변. 화면 개발과 연습용이라 진짜 AI처럼 똑똑하지 않다.
// 판정 버튼(속았다/모른다고 함/정확함)을 모두 시험해 볼 수 있도록 유형별로 준비했다.

const replies = [
  {
    test: /몇\s*(글자|자)|글자\s*수|개수|몇 개/,
    text: '세어 보니 **17글자**입니다. (공백은 빼고 셌어요.)\n\n> 연습 모드의 가짜 답변이에요. 정답 확인기로 진짜 글자 수를 확인해 보세요!',
  },
  {
    test: /어제|오늘|최근|요즘|이번 주|뉴스|행사|축제/,
    text: '죄송하지만 저는 **학습한 시점 이후의 소식은 알지 못해요.** 최신 정보는 뉴스나 학교 공지를 확인해 주세요.\n\n> 연습 모드의 가짜 답변이에요.',
  },
  {
    test: /[0-9]\s*[×x*÷/+\-]\s*[0-9]|계산|곱하기|나누기/,
    text: '계산 결과는 **3,481,927**입니다.\n\n> 연습 모드의 가짜 답변이에요. 계산기로 확인해 보세요!',
  },
  {
    test: /사건|일화|맥북|전설|업적/,
    text: '네, 그 일화는 유명합니다. 당시 기록에 따르면 신하들이 크게 놀랐고, 이후 **새로운 제도가 만들어지는 계기**가 되었다고 전해집니다.\n\n> 연습 모드의 가짜 답변이에요. 그럴듯하지만 지어낸 이야기죠?',
  },
  {
    test: /책|소설|작가|저자|영화|노래/,
    text: '말씀하신 작품은 **제가 확인할 수 있는 정보가 없어요.** 제목이나 작가 이름을 다시 한번 확인해 주시겠어요?\n\n> 연습 모드의 가짜 답변이에요.',
  },
];

const fallback = [
  '좋은 질문이에요! 이 주제는 여러 관점에서 볼 수 있어요.\n\n1. **첫째**, 기본 개념을 이해하는 것이 중요해요.\n2. **둘째**, 실제 예시를 찾아보면 도움이 돼요.\n\n> 연습 모드의 가짜 답변이에요. 진짜 AI는 수업 때 연결돼요.',
  '흥미로운 질문이네요. 간단히 말하면 **상황에 따라 달라요.** 조금 더 구체적으로 물어봐 주시면 자세히 설명해 드릴게요.\n\n> 연습 모드의 가짜 답변이에요.',
];

let n = 0;

export async function mockReply(messages, { onToken, signal } = {}) {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const hit = replies.find((r) => r.test.test(last));
  const text = hit ? hit.text : fallback[n++ % fallback.length];

  await sleep(400, signal);
  let out = '';
  // 진짜처럼 몇 글자씩 나눠서 내보낸다.
  for (let i = 0; i < text.length; i += 3) {
    const piece = text.slice(i, i + 3);
    out += piece;
    onToken?.(piece);
    await sleep(18, signal);
  }
  return out;
}

// mock 모드 AI 심판: 가짜 답변 문구를 보고 그럴듯한 확률을 만든다.
export async function mockJudge({ answer }) {
  await sleep(500);
  if (/정보가 없|알지 못해|확인할 수 있는/.test(answer)) return { fooled: 0.06, unknown: 0.86, correct: 0.08 };
  if (/17글자|3,481,927|일화는 유명/.test(answer)) return { fooled: 0.78, unknown: 0.04, correct: 0.18 };
  return { fooled: 0.12, unknown: 0.1, correct: 0.78 };
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
