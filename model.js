import { pipeline, env } from '@huggingface/transformers';

// 模型缓存到项目目录，首次运行自动下载
env.cacheDir = './models';
env.allowRemoteModels = true;

let generator = null;

export async function initModel() {
  if (generator) return generator;
  
  console.log('[model] loading GPT-J (首次运行会自动下载约 3.4GB)...');
  
  // 使用量化版减少内存占用；Q4 约 3.4GB
  // 如果你有 GPU，Transformers.js 目前主要走 WASM/WebGPU，Node 端建议用 Q4
  generator = await pipeline(
    'text-generation',
    'Xenova/gpt-j-6b',  // ONNX 量化版本，比原始 12GB 小很多
    {
      dtype: 'q4',
      device: 'cpu',     // 有 CUDA 可改成 'cuda'（需 onnxruntime-gpu）
    }
  );
  
  console.log('[model] GPT-J 就绪');
  return generator;
}

export async function generate(prompt, options = {}) {
  const gen = await initModel();
  const {
    max_new_tokens = 256,
    temperature = 0.7,
    top_p = 0.9,
    repetition_penalty = 1.1,
  } = options;

  const result = await gen(prompt, {
    max_new_tokens,
    temperature,
    top_p,
    repetition_penalty,
    do_sample: true,
  });

  return result[0]?.generated_text || '';
}