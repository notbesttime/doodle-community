// POST /api/posts/:id/favorite - 收藏
// DELETE /api/posts/:id/favorite - 取消收藏
import { getUserFromRequest, json, cors, checkLevelUp, createMessage } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

// 收藏
export async function onRequestPost({ params, request, env, ctx }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const postId = params.id;
        const post = await env.DB.prepare('SELECT id, user_id FROM posts WHERE id = ?').bind(postId).first();
        if (!post) return json({ error: '帖子不存在' }, 404);

        const existing = await env.DB.prepare(
            'SELECT id FROM favorites WHERE post_id = ? AND user_id = ?'
        ).bind(postId, user.id).first();
        if (existing) return json({ error: '已经收藏过了' }, 400);

        user.exp += 1;
        const leveledUp = checkLevelUp(user);

        const today = new Date().toISOString().slice(0, 10);

        // 批量执行：收藏记录 + 帖子计数 + 用户经验等级 + 每日计数 + 任务进度
        await env.DB.batch([
            env.DB.prepare('INSERT INTO favorites (post_id, user_id) VALUES (?, ?)').bind(postId, user.id),
            env.DB.prepare('UPDATE posts SET favorites_count = favorites_count + 1 WHERE id = ?').bind(postId),
            env.DB.prepare('UPDATE users SET exp = ?, level = ? WHERE id = ?').bind(user.exp, user.level, user.id),
            env.DB.prepare(
                `UPDATE users SET daily_favorites = CASE WHEN daily_tasks_date = ? THEN daily_favorites + 1 ELSE 1 END,
                 daily_tasks_date = CASE WHEN daily_tasks_date = ? THEN daily_tasks_date ELSE ? END
                 WHERE id = ?`
            ).bind(today, today, today, user.id),
            env.DB.prepare(
                `INSERT INTO user_tasks (user_id, task_id, progress, target, task_date) VALUES (?, 'fav2', 1, 2, ?)
                 ON CONFLICT(user_id, task_id, task_date) DO UPDATE SET progress = progress + 1`
            ).bind(user.id, today)
        ]);

        // 给帖子作者发消息，改为异步不等待
        if (post.user_id !== user.id) {
            const msgWork = async () => {
                await createMessage(env, post.user_id, 'favorite', user.nickname, '收藏了你的帖子', postId);
            };
            if (ctx && ctx.waitUntil) {
                ctx.waitUntil(msgWork());
            } else {
                await msgWork();
            }
        }

        const { favorites_count } = await env.DB.prepare('SELECT favorites_count FROM posts WHERE id = ?').bind(postId).first();

        return json({ favorited: true, favorites: favorites_count, user: { exp: user.exp, level: user.level, leveledUp } });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}

// 取消收藏
export async function onRequestDelete({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const postId = params.id;
        await env.DB.prepare(
            'DELETE FROM favorites WHERE post_id = ? AND user_id = ?'
        ).bind(postId, user.id).run();

        await env.DB.prepare(
            'UPDATE posts SET favorites_count = MAX(0, favorites_count - 1) WHERE id = ?'
        ).bind(postId).run();

        const { favorites_count } = await env.DB.prepare('SELECT favorites_count FROM posts WHERE id = ?').bind(postId).first();

        return json({ favorited: false, favorites: favorites_count });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
