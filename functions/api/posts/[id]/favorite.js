// POST /api/posts/:id/favorite - 收藏
// DELETE /api/posts/:id/favorite - 取消收藏
import { getUserFromRequest, json, cors, checkLevelUp, createMessage, updateDailyCount, updateTaskProgress } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

// 收藏
export async function onRequestPost({ params, request, env }) {
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

        await env.DB.prepare(
            'INSERT INTO favorites (post_id, user_id) VALUES (?, ?)'
        ).bind(postId, user.id).run();

        await env.DB.prepare(
            'UPDATE posts SET favorites_count = favorites_count + 1 WHERE id = ?'
        ).bind(postId).run();

        user.exp += 1;
        const leveledUp = checkLevelUp(user);
        await env.DB.prepare(
            'UPDATE users SET exp = ?, level = ? WHERE id = ?'
        ).bind(user.exp, user.level, user.id).run();

        // 更新每日收藏计数和任务进度
        const today = new Date().toISOString().slice(0, 10);
        await updateDailyCount(env, user.id, 'daily_favorites', today);
        await updateTaskProgress(env, user.id, 'fav2', 2, today);

        if (post.user_id !== user.id) {
            await createMessage(env, post.user_id, 'favorite', user.nickname, '收藏了你的帖子', postId);
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
