export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    vercelEnv: process.env.VERCEL_ENV || null,
    nodeEnv: process.env.NODE_ENV || null,
    hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
    openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    openAiImageModel: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1',
    url: req.url || null,
    method: req.method || null,
  });
}
