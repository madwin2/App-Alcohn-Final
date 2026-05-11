export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    vercelEnv: process.env.VERCEL_ENV || null,
    nodeEnv: process.env.NODE_ENV || null,
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    openAiImageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    openAiImageModelFallbacks: process.env.OPENAI_IMAGE_MODEL_FALLBACKS || 'gpt-image-1.5,gpt-image-1',
    openAiImageTimeoutMs: process.env.OPENAI_IMAGE_TIMEOUT_MS || '90000',
    url: req.url || null,
    method: req.method || null,
  });
}
