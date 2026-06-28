// POST /api/reports - 提交举报
// body: { type: 'post'|'comment', targetId: number, reason?: string }
import { getUserFromRequest, json, cors } from './lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const { type, targetId, reason } = await request.json();
        if (!['post', 'comment'].includes(type)) return json({ error: '无效的举报类型' }, 400);
        if (!targetId) return json({ error: '缺少举报目标ID' }, 400);

        // 检查是否已举报过
        const existing = await env.DB.prepare(
            'SELECT id FROM reports WHERE type = ? AND target_id = ? AND user_id = ?'
        ).bind(type, targetId, user.id).first();

        if (existing) return json({ error: '您已举报过该内容' }, 400);

        // 检查目标是否存在
        const table = type === 'post' ? 'posts' : 'comments';
        const target = await env.DB.prepare(`SELECT id FROM ${table} WHERE id = ?`).bind(targetId).first();
        if (!target) return json({ error: '举报目标不存在' }, 404);

        await env.DB.prepare(
            'INSERT INTO reports (type, target_id, user_id, reason) VALUES (?, ?, ?, ?)'
        ).bind(type, targetId, user.id, reason || '').run();

        return json({ success: true, message: '举报成功，感谢您为社区做出的贡献' });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
