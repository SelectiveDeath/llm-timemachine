"""KoGPT2 원본(PyTorch) 동작 확인: 다음 토큰 확률과 이어 쓰기."""
import os, sys, torch
os.environ.setdefault("HF_HOME", os.path.join(os.path.dirname(__file__), "hf-cache"))
from transformers import AutoModelForCausalLM, PreTrainedTokenizerFast

MODEL = "skt/kogpt2-base-v2"
tok = PreTrainedTokenizerFast.from_pretrained(
    MODEL, bos_token="</s>", eos_token="</s>", unk_token="<unk>", pad_token="<pad>", mask_token="<mask>")
model = AutoModelForCausalLM.from_pretrained(MODEL).eval()

def top_next(text, k=5):
    ids = tok.encode(text, return_tensors="pt")
    with torch.no_grad():
        logits = model(ids).logits[0, -1]
    p = torch.softmax(logits, -1)
    v, i = p.topk(k)
    return [(tok.convert_ids_to_tokens(int(t)), round(float(x) * 100, 1)) for x, t in zip(v, i)]

for s in sys.argv[1:] or ["오늘 점심에 먹은", "옛날 옛적에", "대한민국의 수도는"]:
    print(s, "->", tok.tokenize(s))
    print("  top5:", top_next(s))
    torch.manual_seed(0)
    ids = tok.encode(s, return_tensors="pt")
    out = model.generate(ids, max_new_tokens=30, do_sample=True, temperature=0.8, top_k=50,
                         repetition_penalty=1.2, pad_token_id=tok.pad_token_id)
    print("  gen:", tok.decode(out[0]))
