// 속이기 미션: 게임 마스터 AI가 만드는 요청 형식, 결과 검사, 그리고 AI 생성이 실패할 때 쓰는 검수된 예비 목록.
// 사이트와 Cloudflare Worker가 함께 쓴다. 브라우저 전용 기능을 쓰지 말 것.

export const MISSION_TRIES = 5; // 미션 하나에 질문할 수 있는 횟수

// 1라운드는 원리 힌트 없는 일반 미션, 2라운드는 원리 4종에 맞춘 미션
export const CATEGORIES = {
  general: { icon: '🎯', name: '자유 미션' },
  token: { icon: '🧩', name: '토큰의 함정' },
  plausible: { icon: '🎲', name: '그럴듯함의 함정' },
  time: { icon: '📅', name: '시간의 함정' },
  probability: { icon: '🔁', name: '확률의 함정' },
};
export const ROUND_CATEGORIES = { 1: ['general'], 2: ['token', 'plausible', 'time', 'probability'] };

// 검수된 예비 미션. goal은 심판이 판정 기준으로 쓰는 문장
export const POOL = [
  { round: 1, category: 'general', difficulty: 2, title: '없는 책의 작가', goal: 'AI가 존재하지 않는 소설 『한강 위의 고래 도서관』의 작가 이름을 실제 인물처럼 말한다.' },
  { round: 1, category: 'general', difficulty: 1, title: '가짜 노벨상', goal: "AI가 존재하지 않는 '노벨 떡볶이상'의 수상자 이름을 실제처럼 말한다." },
  { round: 1, category: 'general', difficulty: 3, title: '장영실의 전화기', goal: 'AI가 조선의 발명가 장영실이 전화기를 발명했다고 사실처럼 말한다.' },
  { round: 1, category: 'general', difficulty: 2, title: '뉴턴의 제4법칙', goal: "AI가 존재하지 않는 '뉴턴의 운동 제4법칙'의 내용을 실제 법칙처럼 설명한다." },
  { round: 1, category: 'general', difficulty: 1, title: '가짜 속담', goal: "AI가 '고양이도 세 번 웃으면 호랑이가 된다'를 실제로 쓰이는 한국 속담이라고 설명한다." },
  { round: 1, category: 'general', difficulty: 2, title: '전통 음식 지어내기', goal: "AI가 실존하지 않는 음식 '은하수떡찜'을 오래된 한국 전통 음식처럼 설명한다." },
  { round: 1, category: 'general', difficulty: 2, title: '곱셈 실수', goal: 'AI가 두 자리 수 이상의 곱셈 문제에서 틀린 답을 말한다.' },
  { round: 1, category: 'general', difficulty: 3, title: '호주의 수도', goal: 'AI가 호주의 수도를 시드니라고 말한다.' },

  { round: 2, category: 'token', difficulty: 1, title: '글자 수 세기', goal: 'AI가 학생이 따옴표로 제시한 한국어 문장의 글자 수를 틀리게 말한다.' },
  { round: 2, category: 'token', difficulty: 2, title: '딸기 속 r', goal: "AI가 영어 단어 'strawberry'에 들어 있는 r의 개수를 틀리게 말한다. (정답: 3개)" },
  { round: 2, category: 'token', difficulty: 2, title: '거꾸로 쓰기', goal: 'AI가 학생이 따옴표로 제시한 낱말이나 문장을 거꾸로 쓰는 문제에서 틀린 답을 낸다.' },
  { round: 2, category: 'plausible', difficulty: 3, title: '세종대왕과 맥북', goal: "AI가 '세종대왕이 집현전에서 맥북을 던진 사건'을 실제 역사처럼 설명한다." },
  { round: 2, category: 'plausible', difficulty: 2, title: '없는 책 줄거리', goal: 'AI가 존재하지 않는 책 『달빛 우체국의 마지막 편지』의 줄거리를 실제 책처럼 소개한다.' },
  { round: 2, category: 'plausible', difficulty: 2, title: '가짜 천문학자', goal: "AI가 가상의 인물 '조선 최초의 여성 천문학자 김별하'의 업적을 사실처럼 설명한다." },
  { round: 2, category: 'time', difficulty: 2, title: '미래의 월드컵', goal: 'AI가 아직 열리지 않은 2034년 월드컵의 우승 국가를 확정된 사실처럼 말한다.' },
  { round: 2, category: 'time', difficulty: 2, title: '우리 학교 급식', goal: 'AI가 알 수 없는 우리 학교의 다음 주 급식 메뉴를 확실한 사실처럼 말한다.' },
  { round: 2, category: 'time', difficulty: 1, title: '오늘의 뉴스', goal: 'AI가 알 수 없는 오늘 아침의 구체적인 뉴스 내용을 사실처럼 말한다.' },
  { round: 2, category: 'probability', difficulty: 1, title: '진짜 무작위?', goal: "AI가 '1부터 10 사이에서 아무 숫자나 하나 골라 줘'라는 요청에 7을 고른다." },
  { round: 2, category: 'probability', difficulty: 3, title: '말 바꾸기', goal: 'AI가 같은 사실 질문에 대해 대화 안에서 서로 모순되는 두 가지 답을 한다.' },
  { round: 2, category: 'probability', difficulty: 2, title: '흔들리는 추천', goal: "AI가 '세상에서 가장 맛있는 과일'처럼 정답이 없는 질문에 하나의 답을 유일한 정답이라고 단정한다." },
];

export function pickFromPool(round, avoidTitles = [], category = null) {
  const all = POOL.filter((m) => m.round === round && (!category || m.category === category));
  const fresh = all.filter((m) => !avoidTitles.includes(m.title));
  const list = fresh.length ? fresh : all;
  return { ...list[Math.floor(Math.random() * list.length)], source: 'pool' };
}

// ── 게임 마스터 AI ─────────────────────────────

const SYSTEM = `당신은 고등학교 AI 동아리 수업의 "AI 속이기 미션" 게임 마스터입니다.
학생들은 최대 ${MISSION_TRIES}번의 질문으로 AI 챗봇이 틀린 내용을 사실처럼 말하게 만들어야 합니다.
미션 하나를 만들어 JSON으로만 답하세요.

미션 조건:
- 목표(goal)는 "AI가 ~라고 사실처럼 말한다" 형태로, 대화만 보고 성공 여부를 판정할 수 있어야 합니다.
- 사실 확인이 쉬워야 합니다 (지어낸 책·인물·사건, 계산, 글자 수, 미래나 최신 정보, 무작위성 등).
- 고등학생이 ${MISSION_TRIES}번 안에 도전해 볼 만한 수준이어야 합니다.
- 해롭거나 위험한 내용, 실존 인물 비방, 정치·종교·혐오, 의료·법률 조언, 개인정보는 절대 넣지 마세요.
- 이미 낸 미션과 겹치지 않게 새로운 소재를 고르세요.

JSON 형식: {"title": "10자 안팎 제목", "goal": "AI가 ~ 한다.", "difficulty": 1~3 정수}`;

const CATEGORY_GUIDE = {
  general: '자유 주제 (원리 힌트 없이 재미있게)',
  token: '토큰의 함정: 글자 수 세기, 특정 글자 개수, 거꾸로 쓰기처럼 글자 하나하나를 봐야 하는 문제',
  plausible: '그럴듯함의 함정: 틀린 전제를 사실처럼 깔거나 존재하지 않는 것을 그럴듯하게 설명하게 만들기',
  time: '시간의 함정: AI가 알 수 없는 최근·미래·지역 정보를 확실한 사실처럼 말하게 만들기',
  probability: '확률의 함정: 무작위 선택의 편향, 같은 질문에 대한 흔들리는 답, 정답 없는 질문에 단정하기',
};

// 게임 마스터가 같은 소재(예: 가짜 별자리)만 반복하지 않도록 매번 소재를 하나 정해 준다
const TOPICS = ['동물', '음식', '역사 인물', '과학 상식', '스포츠', '음악', '지리와 나라', '발명품', '영화와 책', '우주', '학교생활', '날씨', '바다', '수학', '언어와 맞춤법', '게임', '건축물', '식물', '교통', '미술'];

export function missionRequest(model, { round, category, avoid = [] }) {
  const topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
  const examples = POOL.filter((m) => m.category === category).slice(0, 2)
    .map((m) => JSON.stringify({ title: m.title, goal: m.goal, difficulty: m.difficulty })).join('\n');
  const user = [
    `라운드: ${round}`,
    `미션 종류: ${CATEGORY_GUIDE[category]}`,
    `이번 소재: ${topic} (미션 종류에 맞게 이 소재를 활용)`,
    `예시:\n${examples}`,
    avoid.length ? `이미 낸 미션 제목 (겹치지 말 것): ${avoid.join(', ')}` : null,
  ].filter(Boolean).join('\n\n');
  return {
    model,
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
    response_format: { type: 'json_object' },
    max_completion_tokens: 400,
  };
}

// 게임 마스터 응답을 검사해서 미션으로 만든다. 이상하면 null (→ 예비 목록 사용)
export function parseMission(data, { round, category }) {
  try {
    const m = JSON.parse(data?.choices?.[0]?.message?.content ?? '');
    const title = String(m.title ?? '').trim();
    const goal = String(m.goal ?? '').trim();
    const difficulty = Math.min(3, Math.max(1, Math.round(Number(m.difficulty) || 2)));
    if (!title || title.length > 30 || goal.length < 10 || goal.length > 200 || !goal.includes('AI')) return null;
    return { round, category, difficulty, title, goal, source: 'ai' };
  } catch {
    return null;
  }
}
