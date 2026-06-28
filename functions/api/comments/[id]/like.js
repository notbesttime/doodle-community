// POST /api/comments/:id/like - 评论点赞/取消点赞
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const commentId = params.id;
        const existing = await env.DB.prepare(
            'SELECT id FROM comment_likes WHERE comment_id = ? AND user_id = ?'
        ).bind(commentId, user.id).first();

        if (existing) {
            // 取消点赞
            await env.DB.prepare('DELETE FROM comment_likes WHERE id = ?').bind(existing.id).run();
            await env.DB.prepare('UPDATE comments SET likes_count = max(0, likes_count - 1) WHERE id = ?').bind(commentId).run();
            return json({ liked: false, message: '已取消点赞' });
        } else {
            // 点赞
            await env.DB.prepare(
                'INSERT INTO comment_likes (comment_id, user_id) VALUES (?, ?)'
            ).bind(commentId, user.id).run();
            await env.DB.prepare('UPDATE comments SET likes_count = likes_count + 1 WHERE id = ?').bind(commentId).run();
            return json({ liked: true, message: '已点赞' });
        }
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
