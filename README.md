# LLM 타임머신

AI 동아리 수업 "LLM 타임머신 여행"에서 쓰는 활동 사이트와 발표 슬라이드입니다.

- 사이트: https://selectivedeath.github.io/llm-timemachine/
- 슬라이드: https://selectivedeath.github.io/llm-timemachine/slides/
- 기획서: [PLAN.md](PLAN.md)

## 화면 구성

| 메뉴 | 활동 | 파일 |
|---|---|---|
| ✨ 2026 채팅 | 활동 1·3: 현대 LLM 속이기 (1라운드 / 2라운드) | `js/views/modern.js`, `css/modern.css` |
| 📼 과거 LLM | 활동 2: KoGPT2 같이 쓰기 / 질문하기 | `js/views/retro.js`, `css/retro.css` |
| ⚖️ 비교 리포트 | 활동 4: 과거 vs 현대 비교 | `js/views/report.js`, `css/report.css` |
| 🃏 환각 도감 | 활동 2에서 모은 환각 | `js/views/dex.js` |
| 🏆 라운드 결과 | 1라운드 vs 2라운드 성공률 | `js/views/rounds.js` |

## 자주 바꾸는 설정 (`js/config.js`)

- `ROUND2_CODE`: 2라운드 잠금 해제 코드 (기본 `원리`)
- `MODERN.mode`: `mock`(가짜 답변) / `worker`(수업용)
- `REPORT_MAX_ITEMS`: 리포트에 자동으로 넣을 질문 수

문구는 각 화면 파일(`js/views/*.js`)에 그대로 적혀 있으니 찾아서 고치면 됩니다.

## 로컬에서 실행

JS 모듈을 쓰기 때문에 파일을 더블클릭하면 안 열리고, 로컬 서버가 필요합니다.

```bash
npx serve .
# http://localhost:3000
```

- 과거 LLM 모델은 Hugging Face [Sunbyeolsa/kogpt2-ko-onnx](https://huggingface.co/Sunbyeolsa/kogpt2-ko-onnx)에서 받습니다 (약 130MB, 처음 한 번). 변환 방법은 [tools/notes.md](tools/notes.md) 참고
- 현대 LLM을 실제로 테스트하려면 주소 뒤에 `?dev`를 붙이고 사이드바의 "⚙ 개발 설정"에 API 키를 넣습니다. 키는 그 브라우저에만 저장되고 저장소에는 올라가지 않습니다.

## 기록 저장

조(노트북) 하나의 기록은 브라우저 localStorage에 저장되어 새로고침해도 유지됩니다. 시크릿 모드에서는 창을 닫으면 사라집니다. 사이드바의 "기록 초기화"로 지울 수 있습니다.

## 출처

- KoGPT2: [skt/kogpt2-base-v2](https://huggingface.co/skt/kogpt2-base-v2) (SK텔레콤, CC BY-NC-SA 4.0)
- Transformers.js, Pretendard, Nanum Myeongjo, marked, DOMPurify
