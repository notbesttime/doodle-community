// POST /api/posts/:id/delete - 软删除帖子（楼主/管理员）
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const postId = params.id;
        const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(postId).first();
        if (!post) return json({ error: '帖子不存在' }, 404);
        if (post.user_id !== user.id && user.role !== 'admin') return json({ error: '无权删除此帖子' }, 403);

        await env.DB.prepare('UPDATE posts SET is_deleted = 1 WHERE id = ?').bind(postId).run();

        return json({ success: true, message: '帖子已删除' });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
