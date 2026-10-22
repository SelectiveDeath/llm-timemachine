// 수업 진행 관리: 선생님이 관리자 패널에서 단계를 열면, 모든 학생 노트북이 주기적으로 확인해서 따라간다.
//  - 학생: { status: { team, view, summary, heartbeat } } → { step, session }
//  - 관리자: { admin: { password, action: 'get'|'set'|'reset', step } } → { step, session, teams }
// 저장소는 D1 데이터베이스(binding: DB). 표 구조는 worker/schema/schema.sql

export const MAX_STEP = 6;
const ONLINE_MS = 30_000; // 이 시간 안에 신호를 보낸 조는 "접속 중"

async function readState(db) {
  const { results } = await db.prepare('SELECT key, value FROM state').all();
  const map = Object.fromEntries(results.map((r) => [r.key, r.value]));
  return { step: Number(map.step ?? 0), session: map.session ?? 'first' };
}

export async function handleStatus(s, env) {
  const state = await readState(env.DB);
  // 학생 노트북은 몇 번에 한 번만 조 현황을 기록한다 (D1 쓰기 횟수 절약)
  if (s?.heartbeat && typeof s.team === 'string' && s.team.trim()) {
    const team = s.team.trim().slice(0, 20);
    const view = typeof s.view === 'string' ? s.view.slice(0, 20) : null;
    const summary = s.summary && typeof s.summary === 'object' ? JSON.stringify(s.summary).slice(0, 300) : null;
    await env.DB.prepare('INSERT INTO teams (session, name, view, summary, seen) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(session, name) DO UPDATE SET view = ?3, summary = ?4, seen = ?5')
      .bind(state.session, team, view, summary, Date.now()).run();
  }
  return { status: 200, body: state };
}

export async function handleAdmin(a, env) {
  if (!env.ADMIN_PASSWORD) return { status: 500, body: { error: '관리자 비밀번호가 설정되지 않았어요.' } };
  if (!a || typeof a.password !== 'string' || !(await sameText(a.password, env.ADMIN_PASSWORD))) {
    await new Promise((r) => setTimeout(r, 600)); // 비밀번호 마구 대입 늦추기
    return { status: 401, body: { error: '비밀번호가 맞지 않아요.' } };
  }

  const db = env.DB;
  if (a.action === 'set') {
    const step = Math.trunc(Number(a.step));
    if (!(step >= 0 && step <= MAX_STEP)) return { status: 400, body: { error: '단계 번호가 올바르지 않아요.' } };
    await db.prepare("UPDATE state SET value = ?1 WHERE key = 'step'").bind(String(step)).run();
  } else if (a.action === 'reset') {
    // 새 수업: 모든 단계를 잠그고 수업 id를 바꾼다 → 학생 노트북은 기록을 지우고 처음부터 시작
    const session = crypto.randomUUID().slice(0, 8);
    await db.batch([
      db.prepare("UPDATE state SET value = '0' WHERE key = 'step'"),
      db.prepare("UPDATE state SET value = ?1 WHERE key = 'session'").bind(session),
      db.prepare('DELETE FROM teams'),
    ]);
  }

  const state = await readState(db);
  const now = Date.now();
  const { results } = await db.prepare('SELECT name, view, summary, seen FROM teams WHERE session = ?1 ORDER BY name').bind(state.session).all();
  const teams = results.map((t) => ({
    name: t.name, view: t.view, summary: safeJson(t.summary), ago: now - t.seen, online: now - t.seen < ONLINE_MS,
  }));
  return { status: 200, body: { ...state, teams } };
}

const safeJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

// 길이와 무관하게 비교 시간이 같도록 해시로 비교
async function sameText(a, b) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([a, b].map((t) => crypto.subtle.digest('SHA-256', enc.encode(t))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}
