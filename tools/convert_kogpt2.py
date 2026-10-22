"""KoGPT2 → Transformers.js용 ONNX (fp32 + int8 양자화).

결과: models/kogpt2/{config.json, tokenizer.json, tokenizer_config.json,
                     generation_config.json, onnx/model.onnx, onnx/model_quantized.onnx}
"""
import json, os, shutil
os.environ.setdefault("HF_HOME", os.path.join(os.path.dirname(__file__), "hf-cache"))
from optimum.exporters.onnx import main_export
from onnxruntime.quantization import quantize_dynamic, QuantType

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "models", "kogpt2")
TMP = os.path.join(ROOT, "tools", "out", "kogpt2-export")

shutil.rmtree(TMP, ignore_errors=True)
main_export("skt/kogpt2-base-v2", output=TMP, task="text-generation-with-past", opset=17)
print("exported:", os.listdir(TMP))

os.makedirs(os.path.join(OUT, "onnx"), exist_ok=True)
src = os.path.join(TMP, "model.onnx")
shutil.copy(src, os.path.join(OUT, "onnx", "model.onnx"))
quantize_dynamic(src, os.path.join(OUT, "onnx", "model_quantized.onnx"),
                 weight_type=QuantType.QUInt8, per_channel=False, reduce_range=False)

for f in ("config.json", "generation_config.json", "tokenizer.json"):
    if os.path.exists(os.path.join(TMP, f)):
        shutil.copy(os.path.join(TMP, f), os.path.join(OUT, f))

# 원본 tokenizer_config에는 특수 토큰 정보가 없어서 직접 작성
json.dump({
    "tokenizer_class": "PreTrainedTokenizerFast",
    "bos_token": "</s>", "eos_token": "</s>", "unk_token": "<unk>",
    "pad_token": "<pad>", "mask_token": "<mask>",
    "model_max_length": 1024, "add_bos_token": False, "add_eos_token": False,
}, open(os.path.join(OUT, "tokenizer_config.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)

for root, _, files in os.walk(OUT):
    for f in files:
        p = os.path.join(root, f)
        print(f"{os.path.relpath(p, OUT):40s} {os.path.getsize(p)/1e6:8.1f} MB")
