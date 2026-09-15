import { fetchVectorizerAccount } from './_vectorizerClient.js';

let cached = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ status: 'system_error', message: 'Method not allowed', httpStatus: 405 });
    return;
  }

  const now = Date.now();
  if (cached && now - cachedAt < CACHE_MS) {
    res.status(200).json(cached);
    return;
  }

  const result = await fetchVectorizerAccount();
  if (result.httpStatus === 200) {
    cached = result.body;
    cachedAt = now;
  }
  res.status(result.httpStatus).json(result.body);
}
