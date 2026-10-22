import os, sys
from onnxruntime.quantization import quantize_dynamic, QuantType
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
d = os.path.join(ROOT, "models", "kogpt2", "onnx")
quantize_dynamic(os.path.join(d, "model.onnx"), os.path.join(d, "model_quantized.onnx"),
                 weight_type=QuantType.QUInt8, per_channel=False, reduce_range=False)
print(os.path.getsize(os.path.join(d, "model_quantized.onnx")) / 1e6, "MB")
