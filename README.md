# LLM 타임머신

AI 동아리 수업 "LLM 타임머신 여행"에서 쓰는 활동 사이트와 발표 슬라이드입니다.

- 사이트: https://selectivedeath.github.io/llm-timemachine/
- 슬라이드: https://selectivedeath.github.io/llm-timemachine/slides/
- 기획서: [PLAN.md](PLAN.md)

## 화면 구성

| 메뉴 | 활동 | 모델 | 파일 |
|---|---|---|---|
| ✨ 현대 LLM | 활동 1: 속이기 미션 5개 (질문 5번 안에, AI 심판 판정) | gpt-5.4 (심판·출제는 gpt-5.4-mini) | `js/views/modern.js`, `js/views/mission.js`(공용), `js/missions.js`, `js/judge.js` |
| 🧩 원리 체험 | 파트 1.5: 다음 말 확률, 토큰 보기 | KoGPT2 (노트북에서 실행) | `js/views/principle.js`, `js/kogpt2.js` |
| 📼 과거 LLM | 활동 2: 1라운드와 같은 미션 5개를 과거 LLM에게 | gpt-3.5-turbo | `js/views/past.js`, `css/past.css` |
| ⚖️ 비교 리포트 | 활동 3: 과거 vs 현대 비교, 마지막에 🚀 최신 모델 공개 | 3.5 ↔ 5.4 (+ gpt-6-sol) | `js/views/report.js` |
| 🃏 환각 도감 | 과거 LLM이 미션에서 속은 답 (자동 수집) | | `js/views/dex.js` |
| 🏆 미션 결과 | 같은 미션에서 현대 LLM vs 과거 LLM 점수 비교 | | `js/views/results.js` |

OpenAI 호출은 모두 Cloudflare Worker(`worker/worker.js`)를 거칩니다. 모델은 `worker/wrangler.toml`의 `MODEL`, `PAST_MODEL`, `LATEST_MODEL`, `JUDGE_MODEL`에서 바꾸고, 화면에 표시되는 이름은 `js/config.js`의 `MODELS`에서 바꿉니다.

## 자주 바꾸는 설정 (`js/config.js`)

- `MODERN.mode`: `mock`(가짜 답변) / `worker`(수업용). 주소 뒤에 `?mock`을 붙이면 잠깐 가짜 답변 모드로 볼 수 있음
- `REPORT_MAX_ITEMS`: 리포트에 자동으로 넣을 질문 수

문구는 각 화면 파일(`js/views/*.js`)에 그대로 적혀 있으니 찾아서 고치면 됩니다.

## 수업 진행 (관리자 패널)

- 주소: https://selectivedeath.github.io/llm-timemachine/admin.html (학생 사이트에는 링크가 없음)
- 비밀번호는 Worker 비밀값 `ADMIN_PASSWORD` (바꾸려면 `cd worker && npx wrangler@4.127.1 secret put ADMIN_PASSWORD`)
- 학생 사이트의 "오늘의 순서"는 ① 현대 LLM 속이기 ② 원리 체험 ③ 과거 LLM 속이기(같은 미션) ④ 비교 리포트 ⑤ 최신 모델 공개. 관리자 패널에서 연 단계까지만 쓸 수 있고, 나머지는 🔒
- 학생 노트북은 3초마다 단계를 확인하고(같은 브라우저의 관리자 탭이 바꾸면 즉시), 새 단계가 열리면 그 활동 화면으로 자동 이동. 12초마다 조 현황(화면, 점수 요약)을 보냄. 대화 내용은 보내지 않음
- "새 수업 시작"을 누르면 모든 단계가 잠기고 학생 노트북의 기록(조 이름 포함)이 지워짐 → 리허설 뒤에 사용
- 상태는 Cloudflare D1 데이터베이스 `llm-timemachine`에 저장 (`worker/schema/schema.sql`)
- 주소 뒤에 `?mock`을 붙이면 가짜 답변 + 모든 단계 열림 (연습·개발용). `?mock&step=1`처럼 쓰면 그 단계까지만 열린 모습으로 미리 보기

## 로컬에서 실행

JS 모듈을 쓰기 때문에 파일을 더블클릭하면 안 열리고, 로컬 서버가 필요합니다.

```bash
npx serve .
# http://localhost:3000
```

- 원리 체험 모델(KoGPT2)은 Hugging Face [Sunbyeolsa/kogpt2-ko-onnx](https://huggingface.co/Sunbyeolsa/kogpt2-ko-onnx)에서 받습니다 (약 130MB, 처음 한 번). 변환 방법은 [tools/notes.md](tools/notes.md) 참고
- 현대 LLM을 실제로 테스트하려면 주소 뒤에 `?dev`를 붙이고 사이드바의 "⚙ 개발 설정"에 API 키를 넣습니다. 키는 그 브라우저에만 저장되고 저장소에는 올라가지 않습니다.

## 배포할 때 (중요)

GitHub Pages는 파일을 10분 동안 캐시하므로, JS·CSS를 고친 뒤에는 커밋 전에 꼭 실행하세요.

```bash
python tools/cachebust.py
```

모든 JS·CSS 주소에 버전(`?v=...`)이 붙어서, 학생들은 새로고침(F5) 한 번이면 새 파일을 받습니다.

## 기록 저장

조(노트북) 하나의 기록은 브라우저 localStorage에 저장되어 새로고침해도 유지됩니다. 시크릿 모드에서는 창을 닫으면 사라집니다. 사이드바의 "기록 초기화"로 지울 수 있습니다.

## 출처

- KoGPT2: [skt/kogpt2-base-v2](https://huggingface.co/skt/kogpt2-base-v2) (SK텔레콤, CC BY-NC-SA 4.0)
- Transformers.js, Pretendard, Nanum Myeongjo, marked, DOMPurify
