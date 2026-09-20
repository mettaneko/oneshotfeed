export async function upstash(path, options = {}) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('DB config missing');
  const response = await fetch(`${url}/${path}`, {
    ...options,
    headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || `Upstash HTTP ${response.status}`);
  return data.result;
}
