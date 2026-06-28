// POST /api/posts/:id/like - 点赞
// DELETE /api/posts/:id/like - 取消点赞
import { getUserFromRequest, json, cors, checkLevelUp, createMessage, incrementReceivedLikes } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

// 点赞
export async function onRequestPost({ params, request, env, ctx }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const postId = params.id;
        const post = await env.DB.prepare('SELECT id, user_id FROM posts WHERE id = ?').bind(postId).first();
        if (!post) return json({ error: '帖子不存在' }, 404);

        // 检查是否已点赞
        const existing = await env.DB.prepare(
            'SELECT id FROM likes WHERE post_id = ? AND user_id = ?'
        ).bind(postId, user.id).first();
        if (existing) return json({ error: '已经点过赞了' }, 400);

        user.exp += 1;
        const leveledUp = checkLevelUp(user);

        const today = new Date().toISOString().slice(0, 10);

        // 批量执行：点赞记录 + 帖子计数 + 用户经验等级 + 每日计数 + 任务进度
        await env.DB.batch([
            env.DB.prepare('INSERT INTO likes (post_id, user_id) VALUES (?, ?)').bind(postId, user.id),
            env.DB.prepare('UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?').bind(postId),
            env.DB.prepare('UPDATE users SET exp = ?, level = ? WHERE id = ?').bind(user.exp, user.level, user.id),
            env.DB.prepare(
                `UPDATE users SET daily_likes = CASE WHEN daily_tasks_date = ? THEN daily_likes + 1 ELSE 1 END,
                 daily_tasks_date = CASE WHEN daily_tasks_date = ? THEN daily_tasks_date ELSE ? END
                 WHERE id = ?`
            ).bind(today, today, today, user.id),
            env.DB.prepare(
                `INSERT INTO user_tasks (user_id, task_id, progress, target, task_date) VALUES (?, 'like3', 1, 3, ?)
                 ON CONFLICT(user_id, task_id, task_date) DO UPDATE SET progress = progress + 1`
            ).bind(user.id, today)
        ]);

        // 给帖子作者增加获赞计数和消息，改为异步不等待
        if (post.user_id !== user.id) {
            const sideWork = async () => {
                await incrementReceivedLikes(env, post.user_id);
                await createMessage(env, post.user_id, 'like', user.nickname, '赞了你的帖子', postId);
            };
            if (ctx && ctx.waitUntil) {
                ctx.waitUntil(sideWork());
            } else {
                await sideWork();
            }
        }

        const { likes_count } = await env.DB.prepare('SELECT likes_count FROM posts WHERE id = ?').bind(postId).first();

        return json({ liked: true, likes: likes_count, user: { exp: user.exp, level: user.level, leveledUp } });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}

// 取消点赞
export async function onRequestDelete({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const postId = params.id;
        await env.DB.prepare(
            'DELETE FROM likes WHERE post_id = ? AND user_id = ?'
        ).bind(postId, user.id).run();

        await env.DB.prepare(
            'UPDATE posts SET likes_count = MAX(0, likes_count - 1) WHERE id = ?'
        ).bind(postId).run();

        const { likes_count } = await env.DB.prepare('SELECT likes_count FROM posts WHERE id = ?').bind(postId).first();

        return json({ liked: false, likes: likes_count });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
