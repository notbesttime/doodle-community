// PUT /api/messages/:id/read - 标记消息已读
import { getUserFromRequest, json, cors } from '../../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPut({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        await env.DB.prepare(
            'UPDATE messages SET is_read = 1 WHERE id = ? AND user_id = ?'
        ).bind(params.id, user.id).run();

        return json({ success: true });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
