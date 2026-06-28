// GET /api/user/comments - 我的评论列表
import { getUserFromRequest, json, cors } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const { results } = await env.DB.prepare(
            `SELECT c.id, c.post_id, c.content, c.likes_count, c.created_at, p.title as post_title
             FROM comments c
             LEFT JOIN posts p ON p.id = c.post_id
             WHERE c.user_id = ?
             ORDER BY c.created_at DESC LIMIT 50`
        ).bind(user.id).all();

        const comments = results.map(c => ({
            id: c.id,
            postId: c.post_id,
            postTitle: c.post_title || '帖子已删除',
            content: c.content,
            likes: c.likes_count,
            createdAt: formatTime(c.created_at)
        }));

        return json({ comments });
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
