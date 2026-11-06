// DOM 查询的小简写
export function $(selector: string, root: ParentNode = document) {
	return root.querySelector(selector);
}

export function $all<T extends Element>(selector: string, root: ParentNode = document) {
	return [...root.querySelectorAll<T>(selector)];
}

/** 新建一个元素，顺手设好类名和文字（文字用 textContent，用户内容也可以放心传） */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text) node.textContent = text;
	return node;
}
