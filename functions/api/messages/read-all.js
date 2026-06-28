// POST /api/messages/read-all - 按类型批量标记已读
// Body: { type: "comment" | "like" | "favorite" | "mention" | "system" | "all" }
import { getUserFromRequest, json, cors } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const body = await request.json();
        const type = body.type || 'all';

        const validTypes = ['comment', 'like', 'favorite', 'mention', 'system', 'all'];
        if (!validTypes.includes(type)) {
            return json({ error: '无效的消息类型' }, 400);
        }

        if (type === 'all') {
            await env.DB.prepare(
                'UPDATE messages SET is_read = 1 WHERE user_id = ? AND is_read = 0'
            ).bind(user.id).run();
        } else {
            await env.DB.prepare(
                'UPDATE messages SET is_read = 1 WHERE user_id = ? AND type = ? AND is_read = 0'
            ).bind(user.id, type).run();
        }

        // 返回更新后的未读统计
        const unreadStats = await env.DB.prepare(
            `SELECT type, COUNT(*) as count FROM messages WHERE user_id = ? AND is_read = 0 GROUP BY type`
        ).bind(user.id).all();

        const unread = { total: 0, comment: 0, like: 0, favorite: 0, mention: 0, system: 0 };
        unreadStats.results.forEach(s => {
            unread[s.type] = s.count;
            unread.total += s.count;
        });

        return json({ success: true, unread });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
