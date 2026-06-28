// POST /api/admin/recycle/[id]/restore - 恢复软删除内容
// POST /api/admin/recycle/[id]/hard-delete - 永久删除
import { getUserFromRequest, json, cors } from '../../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限' }, 403);

        const url = new URL(request.url);
        const action = url.pathname.endsWith('/restore') ? 'restore' : 'hard-delete';
        const id = params.id;

        // 判断是帖子还是评论（通过查两个表）
        let isPost = false;
        const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ?').bind(id).first();
        if (post) isPost = true;
        else {
            const comment = await env.DB.prepare('SELECT id FROM comments WHERE id = ?').bind(id).first();
            if (!comment) return json({ error: '内容不存在' }, 404);
        }

        if (action === 'restore') {
            if (isPost) {
                await env.DB.prepare('UPDATE posts SET is_deleted = 0, deleted_at = NULL WHERE id = ?').bind(id).run();
            } else {
                await env.DB.prepare('UPDATE comments SET is_deleted = 0, deleted_at = NULL WHERE id = ?').bind(id).run();
            }
            return json({ success: true, message: '已恢复' });
        } else {
            // 永久删除
            if (isPost) {
                await env.DB.prepare(`DELETE FROM likes WHERE post_id = ?`).bind(id).run();
                await env.DB.prepare(`DELETE FROM favorites WHERE post_id = ?`).bind(id).run();
                await env.DB.prepare(`DELETE FROM comments WHERE post_id = ?`).bind(id).run();
                await env.DB.prepare(`DELETE FROM feed_reads WHERE post_id = ?`).bind(id).run();
                await env.DB.prepare(`DELETE FROM posts WHERE id = ?`).bind(id).run();
            } else {
                await env.DB.prepare(`DELETE FROM comment_likes WHERE comment_id = ?`).bind(id).run();
                await env.DB.prepare(`DELETE FROM comments WHERE id = ?`).bind(id).run();
            }
            return json({ success: true, message: '已永久删除' });
        }
    } catch(e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
