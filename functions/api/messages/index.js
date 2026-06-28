// GET /api/messages - 消息列表
// 未读统计也通过此接口的 query 参数获取
import { getUserFromRequest, json, cors } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const url = new URL(request.url);
        const type = url.searchParams.get('type') || 'all';
        const unreadOnly = url.searchParams.get('unread') === 'true';

        let query = 'SELECT * FROM messages WHERE user_id = ?';
        const params = [user.id];

        if (type !== 'all') {
            query += ' AND type = ?';
            params.push(type);
        }
        if (unreadOnly) {
            query += ' AND is_read = 0';
        }
        query += ' ORDER BY created_at DESC LIMIT 50';

        const { results } = await env.DB.prepare(query).bind(...params).all();

        const messages = results.map(m => ({
            id: m.id,
            type: m.type,
            sender: m.sender_name,
            text: m.content,
            time: formatTime(m.created_at),
            unread: m.is_read === 0,
            relatedPostId: m.related_post_id
        }));

        // 获取未读统计
        const unreadStats = await env.DB.prepare(
            `SELECT type, COUNT(*) as count FROM messages WHERE user_id = ? AND is_read = 0 GROUP BY type`
        ).bind(user.id).all();

        const unread = { total: 0, comment: 0, like: 0, favorite: 0, mention: 0, system: 0 };
        unreadStats.results.forEach(s => {
            unread[s.type] = s.count;
            unread.total += s.count;
        });

        return json({ messages, unread });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}

function formatTime(isoStr) {
    const now = new Date();
    const created = new Date(isoStr + 'Z');
    const diff = Math.floor((now - created) / 1000);
    if (diff < 300) return '刚刚';
    const y = created.getFullYear();
    const m = created.getMonth() + 1;
    const d = created.getDate();
    const h = String(created.getHours()).padStart(2, '0');
    const min = String(created.getMinutes()).padStart(2, '0');
    return `${y}年${m}月${d}日 ${h}:${min}`;
}
