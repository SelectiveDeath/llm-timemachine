# LLM 타임머신

AI 동아리 수업 "LLM 타임머신 여행"에서 쓰는 활동 사이트와 발표 슬라이드입니다.

- 사이트: https://selectivedeath.github.io/llm-timemachine/
- 슬라이드: https://selectivedeath.github.io/llm-timemachine/slides/
- 기획서: [PLAN.md](PLAN.md)

## 화면 구성

| 메뉴 | 활동 | 모델 | 파일 |
|---|---|---|---|
| ✨ 현대 LLM | 활동 1·3: 속이기 미션 (질문 5번 안에, AI 심판 판정) | gpt-5.4-mini | `js/views/modern.js`, `js/missions.js`, `js/judge.js` |
| 🧩 원리 체험 | 파트 1.5: 다음 말 확률, 토큰 보기 | KoGPT2 (노트북에서 실행) | `js/views/principle.js`, `js/kogpt2.js` |
| 📼 과거 LLM | 활동 2: 짝 질문, 다시 묻기, 관찰 표시 | gpt-3.5-turbo | `js/views/past.js`, `css/past.css` |
| ⚖️ 비교 리포트 | 활동 4: 과거 vs 현대 비교 | 3.5 ↔ 5.4-mini | `js/views/report.js` |
| 🃏 환각 도감 | 과거 LLM에서 모은 환각 | | `js/views/dex.js` |
| 🏆 미션 결과 | 1라운드 vs 2라운드 | | `js/views/results.js` |

OpenAI 호출은 모두 Cloudflare Worker(`worker/worker.js`)를 거칩니다. 모델은 `worker/wrangler.toml`의 `MODEL`, `PAST_MODEL`에서 바꾸고, 화면에 표시되는 이름은 `js/config.js`의 `MODELS`에서 바꿉니다.

## 자주 바꾸는 설정 (`js/config.js`)

- `ROUND2_CODE`: 2라운드 잠금 해제 코드 (기본 `원리`)
- `MODERN.mode`: `mock`(가짜 답변) / `worker`(수업용). 주소 뒤에 `?mock`을 붙이면 잠깐 가짜 답변 모드로 볼 수 있음
- `REPORT_MAX_ITEMS`: 리포트에 자동으로 넣을 질문 수

문구는 각 화면 파일(`js/views/*.js`)에 그대로 적혀 있으니 찾아서 고치면 됩니다.

## 로컬에서 실행

JS 모듈을 쓰기 때문에 파일을 더블클릭하면 안 열리고, 로컬 서버가 필요합니다.

```bash
npx serve .
# http://localhost:3000
```

- 원리 체험 모델(KoGPT2)은 Hugging Face [Sunbyeolsa/kogpt2-ko-onnx](https://huggingface.co/Sunbyeolsa/kogpt2-ko-onnx)에서 받습니다 (약 130MB, 처음 한 번). 변환 방법은 [tools/notes.md](tools/notes.md) 참고
- 현대 LLM을 실제로 테스트하려면 주소 뒤에 `?dev`를 붙이고 사이드바의 "⚙ 개발 설정"에 API 키를 넣습니다. 키는 그 브라우저에만 저장되고 저장소에는 올라가지 않습니다.

## 기록 저장

조(노트북) 하나의 기록은 브라우저 localStorage에 저장되어 새로고침해도 유지됩니다. 시크릿 모드에서는 창을 닫으면 사라집니다. 사이드바의 "기록 초기화"로 지울 수 있습니다.

## 출처

- KoGPT2: [skt/kogpt2-base-v2](https://huggingface.co/skt/kogpt2-base-v2) (SK텔레콤, CC BY-NC-SA 4.0)
- Transformers.js, Pretendard, Nanum Myeongjo, marked, DOMPurify
