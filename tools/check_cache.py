"""전체 계산 vs 캐시(past) 재사용 계산 비교: fp32와 int8 각각."""
import os, numpy as np, onnxruntime as ort
from transformers import PreTrainedTokenizerFast
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tok = PreTrainedTokenizerFast.from_pretrained(os.path.join(ROOT, "models", "kogpt2"))
ids = tok.encode("어제 친구들과 함께 학교 앞 분식집에 가서 떡볶이와 순대를 먹고 나서 노래방에 갔는데 거기서")

def run(sess, new, past, total):
    feed = {"input_ids": np.array([new], np.int64), "attention_mask": np.ones((1, total), np.int64),
            "position_ids": np.arange(total - len(new), total, dtype=np.int64)[None]}
    for l in range(12):
        for kv in ("key", "value"):
            feed[f"past_key_values.{l}.{kv}"] = past[f"{l}.{kv}"] if past else np.zeros((1, 12, 0, 64), np.float32)
    names = [o.name for o in sess.get_outputs()]
    outs = dict(zip(names, sess.run(names, feed)))
    pres = {n[len("present."):]: v for n, v in outs.items() if n.startswith("present.")}
    return outs["logits"][0, -1], pres

def probs(x):
    p = np.exp(x - x.max()); return p / p.sum()

for name in ("model.onnx", "model_quantized.onnx"):
    s = ort.InferenceSession(os.path.join(ROOT, "models", "kogpt2", "onnx", name))
    full, _ = run(s, ids, None, len(ids))
    _, past = run(s, ids[:-1], None, len(ids) - 1)
    inc, _ = run(s, ids[-1:], past, len(ids))
    print(f"{name:22s} 최대 확률 차이 {np.abs(probs(full) - probs(inc)).max() * 100:.4f}%p")
