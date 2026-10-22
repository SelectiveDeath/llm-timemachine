// 사이트 설정. 수업 전에 바꿀 일이 있는 값은 모두 여기에 있다.

// 화면에 보여 줄 모델 정보 (실제 호출 모델은 Worker의 MODEL / PAST_MODEL 설정이 정한다)
export const MODELS = {
  modern: { id: 'gpt-5.4', year: 2026, desc: '현대 LLM' },
  past: { id: 'gpt-3.5-turbo', year: 2022, desc: '초기 ChatGPT' },
  latest: { id: 'gpt-6-sol', year: 2026, desc: '최신 모델 (리포트 마지막에 공개)' },
  judge: { id: 'gpt-5.4-mini' }, // 미션 출제와 AI 심판
  principle: { id: 'KoGPT2', year: 2021, desc: '1.25억 개 가중치 · 노트북에서 실행' },
};

// 원리 체험용 KoGPT2 모델 위치
//  - hf:    배포용. Hugging Face에 올린 변환본 (https://huggingface.co/Sunbyeolsa/kogpt2-ko-onnx)
//  - local: 개발용. 저장소 루트의 models/kogpt2 폴더 (git에는 올라가지 않음, id도 'kogpt2'로)
export const OLD_MODEL = {
  source: 'hf',
  id: 'Sunbyeolsa/kogpt2-ko-onnx',
  localPath: 'models/',
};

// OpenAI 연결 방식
//  - mock:   가짜 답변 (개발·연습용, 비용 0)
//  - direct: 개발자 PC에서만. 주소 뒤에 ?dev 를 붙이면 키 입력창이 나온다 (키는 그 브라우저에만 저장)
//  - worker: 수업용. Cloudflare Worker를 거쳐 OpenAI 호출 (키는 Worker에만 있음)
export const MODERN = {
  mode: 'worker',
  workerUrl: 'https://llm-timemachine.llm-timemachine.workers.dev',
};

// 리포트에 자동으로 넣을 최대 질문 수
export const REPORT_MAX_ITEMS = 10;
