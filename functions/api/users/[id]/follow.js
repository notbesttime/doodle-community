// POST /api/users/[id]/follow - 关注/取关（toggle）
import { getUserFromRequest, json, cors, createMessage } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ request, env, params }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const targetId = parseInt(params.id);
        if (!targetId) return json({ error: '无效的用户ID' }, 400);
        if (targetId === user.id) return json({ error: '不能关注自己' }, 400);

        // 检查目标用户是否存在
        const target = await env.DB.prepare(
            'SELECT id, nickname FROM users WHERE id = ?'
        ).bind(targetId).first();
        if (!target) return json({ error: '用户不存在' }, 404);

        // 检查是否已关注
        const existing = await env.DB.prepare(
            'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?'
        ).bind(user.id, targetId).first();

        if (existing) {
            // 取关
            await env.DB.prepare(
                'DELETE FROM follows WHERE follower_id = ? AND following_id = ?'
            ).bind(user.id, targetId).run();
            await env.DB.prepare(
                'UPDATE users SET following = following - 1 WHERE id = ?'
            ).bind(user.id).run();
            await env.DB.prepare(
                'UPDATE users SET followers = followers - 1 WHERE id = ?'
            ).bind(targetId).run();
            return json({ following: false, message: `已取消关注「${target.nickname}」` });
        } else {
            // 关注
            await env.DB.prepare(
                'INSERT INTO follows (follower_id, following_id) VALUES (?, ?)'
            ).bind(user.id, targetId).run();
            await env.DB.prepare(
                'UPDATE users SET following = following + 1 WHERE id = ?'
            ).bind(user.id).run();
            await env.DB.prepare(
                'UPDATE users SET followers = followers + 1 WHERE id = ?'
            ).bind(targetId).run();
            // 发消息通知被关注者
            await createMessage(env, targetId, 'system', user.nickname, `用户「${user.nickname}」关注了你`);
            return json({ following: true, message: `已关注「${target.nickname}」` });
        }
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
