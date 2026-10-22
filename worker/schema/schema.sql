-- 수업 진행 상태: step(열린 단계, 0~6), session(새 수업을 시작할 때마다 바뀌는 id)
CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT OR IGNORE INTO state (key, value) VALUES ('step', '0'), ('session', 'first');

-- 조별 현황: 학생 노트북이 주기적으로 보내는 요약 (대화 내용은 보내지 않음)
CREATE TABLE IF NOT EXISTS teams (
  session TEXT NOT NULL,
  name TEXT NOT NULL,
  view TEXT,
  summary TEXT,
  seen INTEGER NOT NULL,
  PRIMARY KEY (session, name)
);
