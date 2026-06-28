// POST /api/posts/:id/hard-delete - 物理删除帖子（仅管理员）
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限，仅管理员可操作' }, 403);

        const postId = params.id;
        const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(postId).first();
        if (!post) return json({ error: '帖子不存在' }, 404);

        // 删除关联数据
        await env.DB.batch([
            env.DB.prepare('DELETE FROM likes WHERE post_id = ?').bind(postId),
            env.DB.prepare('DELETE FROM favorites WHERE post_id = ?').bind(postId),
            env.DB.prepare('DELETE FROM comments WHERE post_id = ?').bind(postId),
            env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(postId)
        ]);

        return json({ success: true, message: '帖子已永久删除' });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
