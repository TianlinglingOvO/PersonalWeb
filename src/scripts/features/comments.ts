// 评论区（/api/comments）：加载与渲染（一律 textContent）、发表 / 回复（乐观更新）、编辑、删除、楼中楼折叠。
// 链接里带 #comment-<id>（如账号页的“回复我的”）时，加载完会展开所在的楼并定位到那条评论
import { navigate } from 'astro:transitions/client';
import { $, $all } from '../core/dom';
import { api } from '../core/api';
import { getAccount, initialOf, loginUrl, setAccount, type Account } from '../core/account';
import { animateHeight, prefersReducedMotion, slide, staggerIn } from '../core/motion';
import { anchorOffset } from '../core/scroll';
import { confirmDialog } from '../core/dialog';
import { fillTime } from '../core/time';
import { toast } from '../core/toast';

interface CommentData {
	id: number;
	user: Account | null;
	replyTo: string | null;
	content: string;
	createdAt: number;
	edited?: boolean;
	deleted: boolean;
	canEdit?: boolean;
	canDelete: boolean;
	replies?: CommentData[];
}

export function init(signal: AbortSignal) {
	const root = $('[data-comments]') as HTMLElement | null;
	if (!root) return;
	const slug = root.dataset.comments ?? '';
	const list = root.querySelector<HTMLOListElement>('[data-comment-list]')!;
	const status = root.querySelector<HTMLElement>('[data-comment-status]')!;
	const countEl = root.querySelector<HTMLElement>('[data-comments-count]')!;
	const mainForm = root.querySelector<HTMLFormElement>('[data-comment-form]')!;
	const loginTip = root.querySelector<HTMLElement>('[data-comment-login]')!;
	const template = root.querySelector<HTMLTemplateElement>('[data-comment-template]')!;
	const reducedMotion = prefersReducedMotion();
	let account: Account | null = null;
	let replyForm: HTMLFormElement | null = null;
	let editForm: HTMLFormElement | null = null;
	// 楼中楼超过 REPLY_PREVIEW 条时只显示前几条，其余收起；记住展开过的楼，刷新列表后保持展开
	const REPLY_PREVIEW = 2;
	const expandedThreads = new Set<number>();
	const setToggleLabel = (button: HTMLButtonElement, open: boolean) => {
		button.setAttribute('aria-expanded', String(open));
		button.textContent = open ? '收起回复' : `展开剩余 ${button.dataset.count} 条回复`;
	};
	const threadParts = (thread: HTMLElement) => {
		const replies = thread.querySelector<HTMLOListElement>(':scope > .comment-body > .comment-replies');
		return {
			replies,
			rest: replies?.querySelector<HTMLElement>(':scope > .comment-replies-rest') ?? null,
			toggle: replies?.querySelector<HTMLButtonElement>(':scope > .comment-replies-toggle-row > button') ?? null,
		};
	};
	const setThreadOpen = (thread: HTMLElement, open: boolean) => {
		const { rest, toggle } = threadParts(thread);
		if (!rest || !toggle || (toggle.getAttribute('aria-expanded') === 'true') === open) return;
		const id = Number(thread.dataset.commentId);
		setToggleLabel(toggle, open);
		if (open) {
			expandedThreads.add(id);
			rest.hidden = false;
			slide(rest, true);
			staggerIn($all('.comment', rest), 40);
		} else {
			expandedThreads.delete(id);
			slide(rest, false, () => (rest.hidden = true));
			// 收起后按钮可能跑到顶栏下面，把这一楼拉回视野
			if (toggle.getBoundingClientRect().top < anchorOffset()) thread.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}
	};

	root.querySelector<HTMLAnchorElement>('[data-login-link]')!.href = loginUrl('#comments');

	const build = (c: CommentData, threadId: number) => {
		const li = template.content.firstElementChild!.cloneNode(true) as HTMLLIElement;
		const q = <T extends HTMLElement>(sel: string) => li.querySelector<T>(sel)!;
		li.dataset.commentId = String(c.id);
		li.dataset.threadId = String(threadId);
		if (c.id) li.id = `comment-${c.id}`;
		if (c.deleted || !c.user) {
			li.classList.add('is-deleted');
			q('[data-c-content]').textContent = '这条评论已被删除';
			q('[data-c-name]').textContent = '';
			q('[data-c-reply]').hidden = true;
		} else {
			q('[data-c-avatar]').textContent = initialOf(c.user.username);
			q('[data-c-avatar]').classList.toggle('is-admin', c.user.isAdmin);
			q('[data-c-name]').textContent = c.user.username;
			q('[data-c-admin]').hidden = !c.user.isAdmin;
			q('[data-c-content]').textContent = c.content;
			li.dataset.author = c.user.username;
		}
		if (c.replyTo) {
			q('[data-c-reply-to]').textContent = `回复 @${c.replyTo}`;
			q('[data-c-reply-to]').hidden = false;
		}
		fillTime(q<HTMLTimeElement>('[data-c-time]'), c.createdAt);
		q('[data-c-delete]').hidden = !c.canDelete;
		q('[data-c-edit]').hidden = !c.canEdit;
		q('[data-c-edited]').hidden = !c.edited;
		const replies = q<HTMLOListElement>('[data-c-replies]');
		const items = (c.replies ?? []).map((r) => build(r, threadId));
		if (items.length > REPLY_PREVIEW) {
			const open = expandedThreads.has(threadId);
			const rest = document.createElement('li');
			rest.className = 'comment-replies-rest';
			rest.hidden = !open;
			const inner = document.createElement('ol');
			inner.className = 'comment-replies-inner';
			inner.append(...items.slice(REPLY_PREVIEW));
			rest.append(inner);
			const row = document.createElement('li');
			row.className = 'comment-replies-toggle-row';
			const toggle = document.createElement('button');
			toggle.type = 'button';
			toggle.className = 'comment-replies-toggle';
			toggle.dataset.cToggleReplies = '';
			toggle.dataset.count = String(items.length - REPLY_PREVIEW);
			setToggleLabel(toggle, open);
			row.append(toggle);
			replies.append(...items.slice(0, REPLY_PREVIEW), rest, row);
		} else if (items.length) {
			replies.append(...items);
		} else {
			replies.remove();
		}
		return li;
	};

	type CommentList = { count: number; comments: CommentData[] };
	const render = (data: CommentList, highlightId?: number) => {
		// 要定位的评论在楼中楼里时，先把那一楼记为展开，生成列表时就不会把它收起来
		const thread = highlightId ? data.comments.find((c) => c.id === highlightId || c.replies?.some((r) => r.id === highlightId)) : null;
		if (thread) expandedThreads.add(thread.id);
		const anim = animateHeight(root, () => {
			replyForm = null;
			editForm = null;
			list.replaceChildren(...data.comments.map((c) => build(c, c.id)));
			countEl.textContent = data.count ? String(data.count) : '';
			status.textContent = '还没有评论，来抢沙发吧～';
			status.hidden = data.comments.length > 0;
		});
		const fresh = highlightId ? list.querySelector<HTMLElement>(`[data-comment-id="${highlightId}"]`) : null;
		if (!fresh) return;
		fresh.classList.add('is-new');
		// 等评论区的高度动画结束、页面长到最终高度后再滚过去，否则滚动目标会被截断
		const reveal = () => {
			const top = fresh.getBoundingClientRect().top;
			if (top > window.innerHeight || top < anchorOffset()) {
				fresh.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
			}
		};
		if (anim) void anim.finished.then(() => requestAnimationFrame(reveal), () => undefined);
		else reveal();
	};

	// 第一次加载时，地址里的 #comment-<id> 指向的评论要定位并闪一下
	let linkedComment = Number(location.hash.match(/^#comment-(\d+)$/)?.[1]) || undefined;
	const load = async () => {
		try {
			render(await api<CommentList>(`/api/comments?slug=${encodeURIComponent(slug)}`, { signal }), linkedComment);
			linkedComment = undefined;
		} catch {
			if (signal.aborted) return;
			status.textContent = '评论暂时加载不出来，稍后刷新试试';
			status.hidden = false;
		}
	};

	const showAccount = (a: Account | null) => {
		account = a;
		mainForm.hidden = !a;
		loginTip.hidden = Boolean(a);
		const avatar = root.querySelector<HTMLElement>('[data-comment-form-avatar]')!;
		avatar.textContent = a ? initialOf(a.username) : '';
		avatar.classList.toggle('is-admin', Boolean(a?.isAdmin));
	};
	void getAccount().then(showAccount);
	void load();
	document.addEventListener(
		'account-change',
		() => {
			void getAccount().then(showAccount);
			void load();
		},
		{ signal },
	);

	// 发送时先把评论以“发送中”的样子放上去（乐观更新），服务器返回最新列表后再整体替换；失败就撤回并把文字还给输入框
	const send = async (form: HTMLFormElement, replyTo?: number) => {
		const textarea = form.querySelector('textarea')!;
		const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
		const content = textarea.value.trim();
		if (!content) {
			textarea.focus();
			return;
		}
		if (!account) return;

		const pending = build(
			{
				id: 0,
				user: account,
				replyTo: form.dataset.replyName ?? null,
				content,
				createdAt: Date.now() / 1000,
				deleted: false,
				canDelete: false,
			},
			0,
		);
		pending.classList.add('is-pending');
		pending.querySelector('[data-c-time]')!.textContent = '发送中…';
		pending.querySelector<HTMLElement>('[data-c-reply]')!.hidden = true;
		animateHeight(root, () => {
			if (replyTo) {
				// 在这一楼回复：先把收起的回复展开，新回复排在最后
				const thread = form.closest<HTMLElement>('.comment-list > .comment')!;
				expandedThreads.add(Number(thread.dataset.commentId));
				setThreadOpen(thread, true);
				const body = form.closest('.comment-body')!;
				let replies = body.querySelector<HTMLOListElement>(':scope > .comment-replies');
				if (!replies) {
					replies = document.createElement('ol');
					replies.className = 'comment-replies';
					body.insertBefore(replies, form);
				}
				(replies.querySelector('.comment-replies-inner') ?? replies).append(pending);
			} else {
				list.prepend(pending);
				status.hidden = true;
			}
		});
		staggerIn([pending]);
		textarea.value = '';
		textarea.dispatchEvent(new Event('input', { bubbles: true }));
		button.disabled = true;

		try {
			const data = await api<CommentList & { id: number }>('/api/comments', { body: { slug, content, replyTo } });
			render(data, data.id);
			toast(replyTo ? '回复成功' : '评论成功，谢谢你的留言～');
		} catch (err) {
			animateHeight(root, () => {
				pending.remove();
				status.hidden = list.children.length > 0;
			});
			textarea.value = content;
			textarea.dispatchEvent(new Event('input', { bubbles: true }));
			toast((err as Error).message);
			if ((err as Error).message === '请先登录') setAccount(null);
		} finally {
			button.disabled = false;
		}
	};

	// 编辑：评论内容原地换成输入框，保存后先乐观显示新内容，服务器确认后整体刷新
	const closeEdit = () => {
		const form = editForm;
		editForm = null;
		if (!form) return;
		const content = form.previousElementSibling as HTMLElement | null;
		slide(form, false, () => {
			form.remove();
			if (content) {
				content.hidden = false;
				staggerIn([content]);
			}
		});
	};
	const openEdit = (li: HTMLElement) => {
		const content = li.querySelector<HTMLElement>(':scope > .comment-body > .comment-content')!;
		if (editForm && editForm.previousElementSibling === content) return closeEdit();
		closeEdit();
		const form = document.createElement('form');
		form.className = 'comment-form is-edit';
		form.dataset.editId = li.dataset.commentId;
		const textarea = document.createElement('textarea');
		textarea.rows = 3;
		textarea.maxLength = 1000;
		textarea.value = content.textContent ?? '';
		textarea.setAttribute('aria-label', '编辑评论');
		const foot = document.createElement('div');
		foot.className = 'comment-form-foot';
		const cancel = document.createElement('button');
		cancel.type = 'button';
		cancel.className = 'btn btn-ghost';
		cancel.textContent = '取消';
		cancel.dataset.editCancel = '';
		const save = document.createElement('button');
		save.type = 'submit';
		save.className = 'btn btn-primary comment-submit';
		save.textContent = '保存';
		foot.append(cancel, save);
		form.append(textarea, foot);
		content.after(form);
		content.hidden = true;
		editForm = form;
		textarea.focus({ preventScroll: true });
		textarea.setSelectionRange(textarea.value.length, textarea.value.length);
		slide(form, true);
	};
	const saveEdit = async (form: HTMLFormElement) => {
		const textarea = form.querySelector('textarea')!;
		const content = textarea.value.trim();
		const target = form.previousElementSibling as HTMLElement;
		if (!content) return textarea.focus();
		if (content === target.textContent?.trim()) return closeEdit();
		const li = form.closest<HTMLElement>('[data-comment-id]')!;
		const before = target.textContent ?? '';
		target.textContent = content;
		li.classList.add('is-pending');
		editForm = null;
		form.remove();
		target.hidden = false;
		try {
			render(await api<CommentList>(`/api/comments/${form.dataset.editId}`, { method: 'PATCH', body: { content } }), Number(form.dataset.editId));
			toast('已保存修改');
		} catch (err) {
			target.textContent = before;
			li.classList.remove('is-pending');
			toast((err as Error).message);
		}
	};

	const closeReply = () => {
		const form = replyForm;
		replyForm = null;
		if (form) slide(form, false, () => form.remove());
	};

	const openReply = (li: HTMLElement) => {
		const thread = list.querySelector<HTMLElement>(`:scope > [data-comment-id="${li.dataset.threadId}"]`);
		if (!thread) return;
		const target = Number(li.dataset.commentId);
		const same = replyForm && Number(replyForm.dataset.replyTo) === target;
		closeReply();
		if (same) return;

		const form = document.createElement('form');
		form.className = 'comment-form is-reply';
		form.dataset.replyTo = String(target);
		if (li.closest('.comment-replies') && li.dataset.author) form.dataset.replyName = li.dataset.author;
		const textarea = document.createElement('textarea');
		textarea.rows = 2;
		textarea.maxLength = 1000;
		textarea.placeholder = `回复 @${li.dataset.author ?? ''}：`;
		textarea.setAttribute('aria-label', textarea.placeholder);
		const foot = document.createElement('div');
		foot.className = 'comment-form-foot';
		const cancel = document.createElement('button');
		cancel.type = 'button';
		cancel.className = 'btn btn-ghost';
		cancel.textContent = '取消';
		cancel.dataset.replyCancel = '';
		const submit = document.createElement('button');
		submit.type = 'submit';
		submit.className = 'btn btn-primary comment-submit';
		submit.textContent = '回复';
		foot.append(cancel, submit);
		form.append(textarea, foot);
		thread.querySelector(':scope > .comment-body')!.append(form);
		replyForm = form;
		textarea.focus({ preventScroll: true });
		slide(form, true);
	};

	root.addEventListener(
		'click',
		async (e) => {
			const target = e.target as HTMLElement;
			const li = target.closest<HTMLElement>('[data-comment-id]');
			if (target.closest('[data-c-toggle-replies]')) {
				const thread = target.closest<HTMLElement>('.comment-list > .comment');
				const toggle = target.closest<HTMLButtonElement>('[data-c-toggle-replies]')!;
				if (thread) setThreadOpen(thread, toggle.getAttribute('aria-expanded') !== 'true');
			} else if (target.closest('[data-c-reply]') && li) {
				if (!account) {
					toast('登录后才能回复哦');
					await navigate(loginUrl('#comments'));
					return;
				}
				openReply(li);
			} else if (target.closest('[data-c-delete]') && li) {
				const hasReplies = Boolean(li.querySelector(':scope > .comment-body > .comment-replies'));
				const ok = await confirmDialog(
					hasReplies ? '删除后无法恢复，下面的回复会保留。' : '删除后无法恢复哦。',
					{ title: '要删除这条评论吗？', confirmText: '删除' },
				);
				if (!ok) return;
				li.classList.add('is-removing');
				try {
					render(await api<CommentList>(`/api/comments/${li.dataset.commentId}`, { method: 'DELETE' }));
					toast('评论已删除');
				} catch (err) {
					li.classList.remove('is-removing');
					toast((err as Error).message);
				}
			} else if (target.closest('[data-c-edit]') && li) {
				openEdit(li);
			} else if (target.closest('[data-reply-cancel]')) {
				closeReply();
			} else if (target.closest('[data-edit-cancel]')) {
				closeEdit();
			}
		},
		{ signal },
	);

	root.addEventListener(
		'submit',
		(e) => {
			e.preventDefault();
			const form = e.target as HTMLFormElement;
			if (form.dataset.editId) void saveEdit(form);
			else void send(form, form.dataset.replyTo ? Number(form.dataset.replyTo) : undefined);
		},
		{ signal },
	);
	root.addEventListener(
		'keydown',
		(e) => {
			const textarea = e.target as HTMLElement;
			if (textarea.tagName === 'TEXTAREA' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
				e.preventDefault();
				(textarea.closest('form') as HTMLFormElement | null)?.requestSubmit();
			}
		},
		{ signal },
	);
	root.addEventListener(
		'input',
		(e) => {
			const textarea = e.target as HTMLTextAreaElement;
			if (textarea.closest('[data-comment-form]')) {
				root.querySelector('[data-comment-counter]')!.textContent = `${textarea.value.length} / 1000`;
			}
		},
		{ signal },
	);
}
