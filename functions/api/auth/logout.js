// POST /api/auth/logout - 退出登录
import { getUserFromRequest, json, cors } from '../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (user) {
            await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(user.token).run();
        }
        return json({ success: true });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
