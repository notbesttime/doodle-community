// POST /api/admin/cleanup - 手动清理0互动老帖
import { getUserFromRequest, json, cors } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限' }, 403);

        const body = await request.json().catch(() => ({}));
        const days = body.days || 30;

        // 先统计有多少条可清理
        const { count: cleanableCount } = await env.DB.prepare(
            `SELECT COUNT(*) as count FROM posts
             WHERE is_deleted = 0 AND likes_count = 0 AND comments_count = 0 AND favorites_count = 0
             AND created_at < datetime('now', '-${days} days')`
        ).first();

        if (body.dryRun) {
            return json({ cleanableCount: cleanableCount || 0, message: `找到${cleanableCount || 0}条可清理的帖子` });
        }

        // 执行清理（最多删500条）
        const oldPosts = await env.DB.prepare(
            `SELECT id FROM posts
             WHERE is_deleted = 0 AND likes_count = 0 AND comments_count = 0 AND favorites_count = 0
             AND created_at < datetime('now', '-${days} days')
             ORDER BY created_at ASC LIMIT 500`
        ).all();

        if (oldPosts.results.length === 0) {
            return json({ success: true, deletedCount: 0, message: '没有需要清理的帖子' });
        }

        const ids = oldPosts.results.map(p => p.id);
        const idList = ids.join(',');
        await env.DB.prepare(`DELETE FROM likes WHERE post_id IN (${idList})`).run();
        await env.DB.prepare(`DELETE FROM favorites WHERE post_id IN (${idList})`).run();
        await env.DB.prepare(`DELETE FROM comments WHERE post_id IN (${idList})`).run();
        await env.DB.prepare(`DELETE FROM feed_reads WHERE post_id IN (${idList})`).run();
        await env.DB.prepare(`DELETE FROM posts WHERE id IN (${idList})`).run();

        return json({ success: true, deletedCount: ids.length, message: `已清理${ids.length}条帖子` });
    } catch(e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
