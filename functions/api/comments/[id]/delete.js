// POST /api/comments/:id/delete - 软删除评论（管理员/楼主可删自己帖子的评论）
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const commentId = params.id;
        const comment = await env.DB.prepare('SELECT * FROM comments WHERE id = ? AND is_deleted = 0').bind(commentId).first();
        if (!comment) return json({ error: '评论不存在' }, 404);

        // 检查权限：评论作者自己、管理员、帖子楼主
        const post = await env.DB.prepare('SELECT user_id FROM posts WHERE id = ?').bind(comment.post_id).first();
        const isPostOwner = post && post.user_id === user.id;
        const isAdmin = user.role === 'admin';

        if (comment.user_id !== user.id && !isPostOwner && !isAdmin) {
            return json({ error: '无权删除此评论' }, 403);
        }

        // 软删除
        await env.DB.prepare(
            "UPDATE comments SET is_deleted = 1, deleted_at = datetime('now') WHERE id = ?"
        ).bind(commentId).run();

        return json({ success: true, message: '评论已删除' });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
