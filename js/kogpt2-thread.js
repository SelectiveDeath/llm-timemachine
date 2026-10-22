// 원리 체험용 KoGPT2 계산 전용 백그라운드 스레드.
// 메인 화면이 멈추지 않도록 모델 로딩·추론을 모두 여기서 처리한다.
import {
  env,
  AutoTokenizer,
  AutoModelForCausalLM,
  InterruptableStoppingCriteria,
  Tensor,
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

let tokenizer = null;
let model = null;
let specialIds = new Set();
const stopper = new InterruptableStoppingCriteria();

// ONNX 세션은 동시에 두 번 돌릴 수 없으므로 모든 작업을 한 줄로 세운다.
let queue = Promise.resolve();
const enqueue = (fn) => (queue = queue.then(fn, fn));

// 같이 쓰기에서 빠르게 입력하면 next 요청이 쌓이는데, 가장 최근 것만 계산한다.
let latestNextId = 0;

const post = (msg) => self.postMessage(msg);

self.onmessage = ({ data }) => {
  const { id, type } = data;
  if (type === 'cancel') {
    stopper.interrupt();
    return;
  }
  if (type === 'next') latestNextId = Math.max(latestNextId, id);

  enqueue(async () => {
    try {
      if (type === 'load') post({ id, type: 'done', result: await load(data) });
      else if (type === 'next') {
        if (id < latestNextId) return post({ id, type: 'done', result: { stale: true } });
        post({ id, type: 'done', result: await next(data) });
      } else if (type === 'generate') post({ id, type: 'done', result: await generate(id, data) });
    } catch (err) {
      post({ id, type: 'error', message: err?.message || String(err) });
    }
  });
};

async function load({ id, source, modelId, localPath }) {
  if (model) return { ready: true };
  if (source === 'local') {
    env.allowLocalModels = true;
    env.allowRemoteModels = false;
    env.localModelPath = localPath;
  } else {
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
  }

  // 파일별 진행률을 합쳐서 하나의 퍼센트로 보낸다.
  const files = new Map();
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) {
      files.set(p.file, { loaded: p.loaded, total: p.total });
      let loaded = 0, total = 0;
      for (const f of files.values()) { loaded += f.loaded; total += f.total; }
      post({ id, type: 'progress', loaded, total });
    }
  };

  const t0 = performance.now();
  tokenizer = await AutoTokenizer.from_pretrained(modelId, { progress_callback });
  model = await AutoModelForCausalLM.from_pretrained(modelId, {
    dtype: 'q8',
    device: 'wasm',
    progress_callback,
  });
  specialIds = new Set(tokenizer.all_special_ids ?? []);
  return { ready: true, ms: Math.round(performance.now() - t0) };
}

function encode(text) {
  const enc = tokenizer(text, { add_special_tokens: false });
  // 빈 문장이면 문장 구분 토큰(</s>)에서 시작한다.
  if (enc.input_ids.dims[1] === 0) return tokenizer('</s>', { add_special_tokens: false });
  return enc;
}

// 같이 쓰기는 문장이 조금씩 길어지므로, 앞부분 계산 결과(past key values)를 재사용한다.
let prefixCache = null; // { ids: number[], past }

const int64 = (arr, dims) => new Tensor('int64', BigInt64Array.from(arr, BigInt), dims);

function slicePast(past, n) {
  const out = {};
  for (const [name, t] of Object.entries(past)) out[name] = t.slice(null, null, [0, n], null);
  return out;
}

// 마지막 위치의 logits만 돌려준다. 바뀐 뒷부분 토큰만 새로 계산.
async function lastLogits(ids) {
  let reuse = 0;
  if (prefixCache) {
    const max = Math.min(prefixCache.ids.length, ids.length - 1);
    while (reuse < max && prefixCache.ids[reuse] === ids[reuse]) reuse++;
  }
  let past = null;
  if (reuse > 0) past = reuse === prefixCache.ids.length ? prefixCache.past : slicePast(prefixCache.past, reuse);

  const fresh = ids.slice(reuse);
  const out = await model({
    input_ids: int64(fresh, [1, fresh.length]),
    attention_mask: int64(new Array(ids.length).fill(1), [1, ids.length]),
    past_key_values: past,
  });
  prefixCache = { ids, past: model.getPastKeyValues(out, null) };
  const [, seq, vocab] = out.logits.dims;
  return { row: out.logits.data.subarray((seq - 1) * vocab, seq * vocab), vocab, reused: reuse };
}

// 다음 토큰 후보 k개와 확률
async function next({ text, k = 8, temperature = 1, noCache = false }) {
  const t0 = performance.now();
  if (noCache) prefixCache = null;
  const enc = encode(text);
  const ids = Array.from(enc.input_ids.data, Number);
  let res;
  try {
    res = await lastLogits(ids);
  } catch (err) {
    // 캐시 재사용이 실패하면 처음부터 다시 계산
    prefixCache = null;
    res = await lastLogits(ids);
  }
  const { row, vocab } = res;

  const t = Math.max(temperature, 0.05);
  let max = -Infinity;
  for (let i = 0; i < vocab; i++) if (row[i] > max) max = row[i];
  let sum = 0;
  const probs = new Float32Array(vocab);
  for (let i = 0; i < vocab; i++) sum += probs[i] = Math.exp((row[i] - max) / t);

  // 특수 토큰(<pad>, <unused0> 등)은 후보에서 뺀다. 단 </s>(글의 끝)는 보여준다.
  const top = [];
  for (let i = 0; i < vocab; i++) {
    if (specialIds.has(i) && i !== 1) continue;
    const p = probs[i] / sum;
    if (top.length < k || p > top[top.length - 1].p) {
      top.push({ id: i, p });
      top.sort((a, b) => b.p - a.p);
      if (top.length > k) top.pop();
    }
  }
  const tokens = tokenizer.model.convert_ids_to_tokens(top.map((c) => c.id));
  return {
    candidates: top.map((c, i) => ({ token: tokens[i], prob: c.p })),
    inputTokens: tokenizer.model.convert_ids_to_tokens(ids),
    reused: res.reused,
    ms: Math.round(performance.now() - t0),
  };
}

// 이어 쓰기 (토큰이 나올 때마다 token 메시지 전송)
// 반환하는 text는 입력 문장 뒤에 그대로 붙이면 되는 형태(필요하면 앞에 띄어쓰기 포함)다.
async function generate(id, { prompt, maxTokens = 40, temperature = 0.8, stopAtNewline = false }) {
  const enc = encode(prompt);
  const promptIds = Array.from(enc.input_ids.data, Number);
  const promptText = tokenizer.decode(promptIds, { skip_special_tokens: true });
  stopper.reset();
  let text = '';
  const t0 = performance.now();

  // 입력과 생성 결과를 함께 디코딩해서 띄어쓰기가 정확하게 나오도록 한다.
  const genIds = [];
  let skippedPrompt = false;
  const streamer = {
    put(tokens) {
      if (!skippedPrompt) { skippedPrompt = true; return; }
      for (const t of tokens[0]) genIds.push(Number(t));
      const full = tokenizer.decode(promptIds.concat(genIds), { skip_special_tokens: true });
      const piece = full.slice(promptText.length + text.length);
      if (!piece) return;
      text += piece;
      post({ id, type: 'token', text: piece });
      if (stopAtNewline && text.trim() && text.trimStart().includes('\n')) stopper.interrupt();
    },
    end() {},
  };

  const sample = temperature > 0.05;
  const out = await model.generate({
    ...enc,
    max_new_tokens: maxTokens,
    do_sample: sample,
    ...(sample ? { temperature, top_k: 50 } : {}),
    repetition_penalty: 1.2,
    stopping_criteria: stopper,
    streamer,
  });
  if (stopAtNewline) text = ' ' + text.trimStart().split('\n')[0].trim();
  const sec = (performance.now() - t0) / 1000;
  const count = out.dims[1] - promptIds.length;
  return { text, ms: Math.round(sec * 1000), tokens: count, tokPerSec: +(count / sec).toFixed(1) };
}
