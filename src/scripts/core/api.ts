/** 调用本站接口（/api/...）：失败时抛出带中文提示的 Error，请求被 abort 时原样抛出 AbortError */
export async function api<T>(url: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
	const offline = '网络好像出了点问题，请稍后再试';
	const res = await fetch(url, {
		method: options.method ?? (options.body ? 'POST' : 'GET'),
		headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
		body: options.body ? JSON.stringify(options.body) : undefined,
		credentials: 'same-origin',
		signal: options.signal,
	}).catch((err: Error) => {
		throw err.name === 'AbortError' ? err : new Error(offline);
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error ?? offline);
	return data as T;
}
