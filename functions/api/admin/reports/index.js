// GET /api/admin/reports - 管理员查看举报列表
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限' }, 403);

        const url = new URL(request.url);
        const status = url.searchParams.get('status') || 'pending';

        let query = 'SELECT r.*, u.username FROM reports r LEFT JOIN users u ON r.user_id = u.id';
        const params = [];

        if (status && status !== 'all') {
            query += ' WHERE r.status = ?';
            params.push(status);
        }
        query += ' ORDER BY r.created_at DESC';

        const { results } = await env.DB.prepare(query).bind(...params).all();

        const reports = await Promise.all(results.map(async (r) => {
            let targetInfo = null;
            if (r.type === 'post') {
                const p = await env.DB.prepare('SELECT id, title, is_deleted, author_name FROM posts WHERE id = ?').bind(r.target_id).first();
                if (p) targetInfo = { id: p.id, title: p.title, isDeleted: !!p.is_deleted, author: p.author_name };
            } else {
                const c = await env.DB.prepare('SELECT c.id, c.content, c.author_name, c.post_id, p.title as postTitle FROM comments c LEFT JOIN posts p ON c.post_id = p.id WHERE c.id = ?').bind(r.target_id).first();
                if (c) targetInfo = { id: c.id, content: c.content, author: c.author_name, postId: c.post_id, postTitle: c.postTitle };
            }

            return {
                id: r.id,
                type: r.type,
                targetId: r.target_id,
                userId: r.user_id,
                username: r.username,
                reason: r.reason,
                status: r.status,
                createdAt: r.created_at,
                target: targetInfo
            };
        }));

        return json({ reports });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
