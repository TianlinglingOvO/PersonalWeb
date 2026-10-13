// DOM 查询的小简写
export function $(selector: string, root: ParentNode = document) {
	return root.querySelector(selector);
}

export function $all<T extends Element>(selector: string, root: ParentNode = document) {
	return [...root.querySelectorAll<T>(selector)];
}
