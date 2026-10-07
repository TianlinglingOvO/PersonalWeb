// 所有 /api 接口的外层：万一接口内部出错，统一返回中文提示，不把内部错误细节暴露给访客
import { fail, type Env } from '../_lib/http';

export const onRequest: PagesFunction<Env> = async ({ next }) => {
	try {
		return await next();
	} catch (err) {
		console.error(err);
		return fail('服务器开小差了，请稍后再试', 500);
	}
};
