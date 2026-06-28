// POST /api/posts/:id/privacy - 切换帖子私密状态（仅楼主）
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const postId = params.id;
        const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(postId).first();
        if (!post) return json({ error: '帖子不存在' }, 404);
        if (post.user_id !== user.id) return json({ error: '无权操作此帖子' }, 403);

        const newVal = post.is_private ? 0 : 1;
        await env.DB.prepare('UPDATE posts SET is_private = ? WHERE id = ?').bind(newVal, postId).run();

        return json({
            success: true,
            isPrivate: !!newVal,
            message: newVal ? '帖子已设为私密，仅自己和管理员可见' : '帖子已设为公开'
        });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
