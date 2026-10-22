// 사이트 설정. 수업 전에 바꿀 일이 있는 값은 모두 여기에 있다.

// 과거 LLM 모델 위치
//  - local: 개발용. 저장소 루트의 models/kogpt2 폴더 (git에는 올라가지 않음)
//  - hf:    배포용. Hugging Face에 올린 변환본 (https://huggingface.co/Sunbyeolsa/kogpt2-ko-onnx)
export const OLD_MODEL = {
  source: 'hf',
  id: 'Sunbyeolsa/kogpt2-ko-onnx',
  localPath: 'models/', // source를 'local'로 바꾸면 이 폴더의 kogpt2를 씀 (id도 'kogpt2'로)
};

// 현대 LLM 연결 방식
//  - mock:   가짜 답변 (개발·연습용, 비용 0)
//  - direct: 개발자 PC에서만. 주소 뒤에 ?dev 를 붙이면 키 입력창이 나온다 (키는 그 브라우저에만 저장)
//  - worker: 수업용. Cloudflare Worker를 거쳐 OpenAI 호출 (키는 Worker에만 있음)
export const MODERN = {
  mode: 'worker',
  model: 'gpt-5.4-mini', // direct 모드용 (worker 모드에서는 Worker의 MODEL 설정을 씀)
  workerUrl: 'https://llm-timemachine.llm-timemachine.workers.dev',
};

// 속이기 2라운드 잠금 해제 코드 (선생님이 슬라이드 12장에서 공개)
export const ROUND2_CODE = '원리';

// 리포트에 자동으로 넣을 최대 질문 수 (과거 LLM은 학생 노트북에서 돌아서 하나에 몇 초씩 걸림)
export const REPORT_MAX_ITEMS = 10;
