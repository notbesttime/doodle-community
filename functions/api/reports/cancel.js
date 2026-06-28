// POST /api/reports/cancel - 取消举报
// body: { type: 'post'|'comment', targetId: number }
import { getUserFromRequest, json, cors } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const { type, targetId } = await request.json();
        if (!['post', 'comment'].includes(type)) return json({ error: '无效的举报类型' }, 400);
        if (!targetId) return json({ error: '缺少举报目标ID' }, 400);

        const result = await env.DB.prepare(
            'DELETE FROM reports WHERE type = ? AND target_id = ? AND user_id = ?'
        ).bind(type, targetId, user.id).run();

        if (result.meta.changes === 0) return json({ error: '未找到举报记录' }, 404);

        return json({ success: true, message: '已取消举报' });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
