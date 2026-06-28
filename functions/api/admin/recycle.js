// GET /api/admin/recycle - 回收站列表（软删除的帖子和评论）
import { getUserFromRequest, json, cors, cleanupExpiredDeleted } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限' }, 403);

        // 清理过期软删除记录（超过24小时自动硬删除）
        await cleanupExpiredDeleted(env);

        const url = new URL(request.url);
        const type = url.searchParams.get('type') || 'posts';

        if (type === 'posts') {
            const { results } = await env.DB.prepare(
                `SELECT p.id, p.title, p.content, p.author_name, p.created_at, p.deleted_at,
                 u.username FROM posts p
                 LEFT JOIN users u ON p.user_id = u.id
                 WHERE p.is_deleted = 1 ORDER BY p.deleted_at DESC`
            ).all();
            return json({ items: results || [], type: 'posts' });
        } else {
            const { results } = await env.DB.prepare(
                `SELECT c.id, c.content, c.author_name, c.created_at, c.deleted_at,
                 p.title as post_title, p.id as post_id
                 FROM comments c
                 LEFT JOIN posts p ON c.post_id = p.id
                 WHERE c.is_deleted = 1 ORDER BY c.deleted_at DESC`
            ).all();
            return json({ items: results || [], type: 'comments' });
        }
    } catch(e) {
        return json({ error: '服务器错误' }, 500);
    }
}
