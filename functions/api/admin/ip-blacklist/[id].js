// DELETE /api/admin/ip-blacklist/[id] - 从黑名单移除IP
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestDelete({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限' }, 403);

        await env.DB.prepare('DELETE FROM ip_blacklist WHERE id = ?').bind(params.id).run();
        // 同时清除该IP的登录失败记录
        await env.DB.prepare('DELETE FROM admin_login_attempts WHERE id = ?').bind(params.id).run();

        return json({ success: true, message: '已解封' });
    } catch(e) {
        return json({ error: '服务器错误' }, 500);
    }
}
