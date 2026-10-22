// 사이트 설정. 수업 전에 바꿀 일이 있는 값은 모두 여기에 있다.

// 과거 LLM 모델 위치
//  - local: 개발용. 저장소 루트의 models/kogpt2 폴더 (git에는 올라가지 않음)
//  - hf:    배포용. Hugging Face에 올린 변환본 (8단계에서 id 교체)
export const OLD_MODEL = {
  source: 'local',
  id: 'kogpt2',
  localPath: 'models/',
};
