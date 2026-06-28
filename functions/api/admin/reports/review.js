// POST /api/admin/reports/review - 管理员处理举报
// body: { reportId, action: 'resolve'|'dismiss', deleteTarget?: true }
import { getUserFromRequest, json, cors } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);
        if (user.role !== 'admin') return json({ error: '无权限' }, 403);

        const { reportId, action, deleteTarget } = await request.json();
        if (!reportId || !['resolve', 'dismiss'].includes(action)) {
            return json({ error: '参数错误' }, 400);
        }

        const report = await env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(reportId).first();
        if (!report) return json({ error: '举报不存在' }, 404);
        if (report.status !== 'pending') return json({ error: '该举报已处理过' }, 400);

        // 如果需要删除违规内容（软删除帖子或删除评论）
        if (deleteTarget && action === 'resolve') {
            if (report.type === 'post') {
                await env.DB.prepare('UPDATE posts SET is_deleted = 1 WHERE id = ?').bind(report.target_id).run();
            } else {
                await env.DB.prepare('DELETE FROM comment_likes WHERE comment_id = ?').bind(report.target_id).run();
                await env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(report.target_id).run();
                const c = await env.DB.prepare('SELECT post_id FROM comments WHERE id = ?').bind(report.target_id).first();
                if (c) await env.DB.prepare('UPDATE posts SET comments_count = max(0, comments_count - 1) WHERE id = ?').bind(c.post_id).run();
            }
        }

        await env.DB.prepare('UPDATE reports SET status = ? WHERE id = ?').bind(action === 'resolve' ? 'resolved' : 'dismissed', reportId).run();

        return json({ success: true, message: action === 'resolve' ? '举报已处理' : '举报已驳回' });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
