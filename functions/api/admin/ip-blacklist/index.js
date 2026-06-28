// GET /api/admin/ip-blacklist - 查看IP黑名单列表
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限' }, 403);

        const { results } = await env.DB.prepare(
            'SELECT id, ip, reason, created_at FROM ip_blacklist ORDER BY created_at DESC'
        ).all();

        return json({ blacklist: results || [] });
    } catch(e) {
        return json({ error: '服务器错误' }, 500);
    }
}

// POST /api/admin/ip-blacklist - 添加IP到黑名单
export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限' }, 403);

        const { ip, reason } = await request.json();
        if (!ip) return json({ error: '请输入IP地址' }, 400);

        await env.DB.prepare(
            'INSERT OR REPLACE INTO ip_blacklist (ip, reason) VALUES (?, ?)'
        ).bind(ip, reason || '管理员手动封禁').run();

        return json({ success: true, message: `已封禁IP: ${ip}` });
    } catch(e) {
        return json({ error: '服务器错误' }, 500);
    }
}

// PUT /api/admin/ip-blacklist - 修改备注
export async function onRequestPut({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限' }, 403);

        const { id, reason } = await request.json();
        if (!id) return json({ error: '缺少ID' }, 400);

        await env.DB.prepare(
            'UPDATE ip_blacklist SET reason = ? WHERE id = ?'
        ).bind(reason || '', id).run();

        return json({ success: true });
    } catch(e) {
        return json({ error: '服务器错误' }, 500);
    }
}
