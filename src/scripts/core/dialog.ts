import { prefersReducedMotion, shake } from './motion';

/**
 * 和网站风格一致的确认弹窗，代替浏览器自带的 confirm()。
 * 传 input 时弹窗里带一个输入框（如注销时确认密码）；传 onConfirm 时点确定会先执行它，
 * 返回字符串表示出错：在弹窗里显示错误并保持打开。
 */
export function confirmDialog(
	message: string,
	{
		title = '确认一下',
		confirmText = '确定',
		cancelText = '取消',
		input,
		onConfirm,
	}: {
		title?: string;
		confirmText?: string;
		cancelText?: string;
		input?: { type?: string; placeholder?: string; autocomplete?: string };
		onConfirm?: (value: string) => Promise<string | void>;
	} = {},
) {
	return new Promise<boolean>((resolve) => {
		const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
			const node = document.createElement(tag);
			node.className = className;
			node.textContent = text;
			return node;
		};
		const dialog = el('dialog', 'confirm-dialog');
		const card = el('form', 'confirm-card');
		const field = input ? el('input', 'confirm-input') : null;
		if (field && input) {
			field.type = input.type ?? 'text';
			field.placeholder = input.placeholder ?? '';
			field.autocomplete = (input.autocomplete ?? 'off') as AutoFill;
		}
		const error = el('p', 'confirm-error');
		error.hidden = true;
		const actions = el('div', 'confirm-actions');
		const cancel = el('button', 'btn btn-ghost', cancelText);
		cancel.type = 'button';
		const ok = el('button', 'btn btn-primary', confirmText);
		ok.type = 'submit';
		actions.append(cancel, ok);
		card.append(el('p', 'confirm-title', title), el('p', 'confirm-message', message), ...(field ? [field] : []), error, actions);
		dialog.append(card);
		document.body.append(dialog);

		let done = false;
		const finish = (result: boolean) => {
			if (done) return;
			done = true;
			resolve(result);
			const remove = () => {
				dialog.close();
				dialog.remove();
			};
			if (prefersReducedMotion()) return remove();
			dialog.classList.add('is-closing');
			card.addEventListener('animationend', remove, { once: true });
			window.setTimeout(remove, 300);
		};
		cancel.addEventListener('click', () => finish(false));
		card.addEventListener('submit', async (e) => {
			e.preventDefault();
			if (!onConfirm) return finish(true);
			ok.disabled = true;
			ok.classList.add('is-loading');
			const problem = await onConfirm(field?.value ?? '');
			ok.disabled = false;
			ok.classList.remove('is-loading');
			if (!problem) return finish(true);
			error.textContent = problem;
			error.hidden = false;
			shake(card);
			field?.select();
		});
		dialog.addEventListener('cancel', (e) => {
			e.preventDefault();
			finish(false);
		});
		dialog.addEventListener('click', (e) => e.target === dialog && finish(false));
		dialog.showModal();
		(field ?? cancel).focus();
	});
}
