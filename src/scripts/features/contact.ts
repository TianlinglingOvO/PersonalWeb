// 联系方式：点击复制（[data-copy]），以及修复 Cloudflare 邮箱混淆把邮箱换成 [email protected] 的问题
import { $all } from '../core/dom';
import { toast } from '../core/toast';

async function copyText(text: string) {
	try {
		await navigator.clipboard.writeText(text);
		toast('已复制');
	} catch {
		toast('复制失败，请手动选择');
	}
}

export function setup() {
	document.addEventListener('click', (event) => {
		const copyBtn = (event.target as HTMLElement | null)?.closest('[data-copy]');
		const text = copyBtn?.getAttribute('data-copy') ?? '';
		if (text) void copyText(text);
	});
}

export function init() {
	$all<HTMLElement>('.contact-copy[data-copy]').forEach((btn) => {
		const text = btn.getAttribute('data-copy');
		const valueEl = btn.querySelector('.contact-value');
		if (text && valueEl && (valueEl.textContent?.includes('[email') || valueEl.querySelector('.__cf_email__'))) {
			valueEl.textContent = text;
		}
	});
}
