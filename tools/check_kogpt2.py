"""원본(PyTorch)과 int8 ONNX의 다음 토큰 상위 5개 비교."""
import os, sys, numpy as np, torch, onnxruntime as ort
os.environ.setdefault("HF_HOME", os.path.join(os.path.dirname(__file__), "hf-cache"))
from transformers import AutoModelForCausalLM, PreTrainedTokenizerFast

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tok = PreTrainedTokenizerFast.from_pretrained(os.path.join(ROOT, "models", "kogpt2"))
ref = AutoModelForCausalLM.from_pretrained("skt/kogpt2-base-v2").eval()
sess = ort.InferenceSession(os.path.join(ROOT, "models", "kogpt2", "onnx", "model_quantized.onnx"))
print("inputs:", [i.name for i in sess.get_inputs()][:4], "...")
cfg = ref.config
H, D = cfg.n_head, cfg.n_embd // cfg.n_head

def onnx_logits(ids):
    feed = {"input_ids": np.array([ids], dtype=np.int64),
            "attention_mask": np.ones((1, len(ids)), dtype=np.int64)}
    names = {i.name for i in sess.get_inputs()}
    if "position_ids" in names:
        feed["position_ids"] = np.arange(len(ids), dtype=np.int64)[None]
    for l in range(cfg.n_layer):
        for kv in ("key", "value"):
            feed[f"past_key_values.{l}.{kv}"] = np.zeros((1, H, 0, D), dtype=np.float32)
    return sess.run(["logits"], feed)[0][0, -1]

def top(logits, k=5):
    p = np.exp(logits - logits.max()); p /= p.sum()
    idx = p.argsort()[::-1][:k]
    return [(tok.convert_ids_to_tokens(int(i)), round(float(p[i]) * 100, 1)) for i in idx]

same = 0
prompts = sys.argv[1:] or ["오늘 점심에 먹은", "대한민국의 수도는", "옛날 옛적에", "해리 포터를 쓴 사람은", "인공지능은"]
for s in prompts:
    ids = tok.encode(s)
    with torch.no_grad():
        r = ref(torch.tensor([ids])).logits[0, -1].numpy()
    a, b = top(r), top(onnx_logits(ids))
    same += a[0][0] == b[0][0]
    print(s, "\n  torch:", a, "\n  onnx :", b)
print(f"top-1 일치 {same}/{len(prompts)}")
