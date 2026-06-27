// GET /api/posts/:id/comments - 获取评论列表
// POST /api/posts/:id/comments - 发表评论
import { getUserFromRequest, json, cors, checkLevelUp, createMessage, checkRateLimit } from '../../../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

// 获取评论
export async function onRequestGet({ params, request, env }) {
    try {
        const postId = params.id;
        const { results } = await env.DB.prepare(
            'SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC'
        ).bind(postId).all();

        const comments = results.map(c => ({
            id: c.id,
            author: c.author_name,
            text: c.content,
            time: formatTime(c.created_at)
        }));

        return json({ comments });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}

// 发评论
export async function onRequestPost({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const postId = params.id;
        const { text } = await request.json();
        if (!text || !text.trim()) return json({ error: '请输入评论内容' }, 400);

        // 频率限制
        if (!await checkRateLimit(env.KV, 'comment:' + user.id, 5, 60)) {
            return json({ error: '评论过于频繁，请稍后再试' }, 429);
        }

        // 检查帖子存在
        const post = await env.DB.prepare('SELECT id, user_id FROM posts WHERE id = ?').bind(postId).first();
        if (!post) return json({ error: '帖子不存在' }, 404);

        // 插入评论
        const result = await env.DB.prepare(
            'INSERT INTO comments (post_id, user_id, author_name, content) VALUES (?, ?, ?, ?)'
        ).bind(postId, user.id, user.nickname, text.trim()).run();

        // 更新帖子评论数
        await env.DB.prepare(
            'UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?'
        ).bind(postId).run();

        // 经验+2 瓶盖+2
        user.exp += 2;
        user.caps += 2;
        checkLevelUp(user);
        await env.DB.prepare(
            'UPDATE users SET exp = ?, caps = ?, level = ? WHERE id = ?'
        ).bind(user.exp, user.caps, user.level, user.id).run();

        // 给帖子作者发消息（不是自己评论自己）
        if (post.user_id !== user.id) {
            await createMessage(env, post.user_id, 'comment', user.nickname, '评论了你的帖子', postId);
        }

        return json({
            comment: {
                id: result.meta.last_row_id,
                author: user.nickname,
                text: text.trim(),
                time: '刚刚'
            },
            user: { exp: user.exp, caps: user.caps, level: user.level },
            message: '评论成功！经验+2 瓶盖+2'
        });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}

function formatTime(isoStr) {
    const now = new Date();
    const created = new Date(isoStr + 'Z');
    const diff = Math.floor((now - created) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    if (diff < 2592000) return Math.floor(diff / 86400) + '天前';
    return created.toLocaleDateString('zh-CN');
}
