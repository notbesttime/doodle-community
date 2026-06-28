// POST /api/posts/:id/edit - 编辑帖子（楼主/管理员）
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const postId = params.id;
        const post = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(postId).first();
        if (!post) return json({ error: '帖子不存在' }, 404);
        if (post.user_id !== user.id && user.role !== 'admin') return json({ error: '无权编辑此帖子' }, 403);

        const { title, content, videoUrl } = await request.json();
        if (title !== undefined && !title.trim()) return json({ error: '标题不能为空' }, 400);

        const updates = [];
        const binds = [];
        if (title !== undefined) { updates.push('title = ?'); binds.push(title.trim()); }
        if (content !== undefined) { updates.push('content = ?'); binds.push(content.trim()); }
        if (videoUrl !== undefined) { updates.push('video_url = ?'); binds.push(videoUrl); }

        if (updates.length === 0) return json({ error: '没有需要更新的内容' }, 400);

        binds.push(postId);
        await env.DB.prepare(`UPDATE posts SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();

        return json({ success: true, message: '编辑成功' });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
