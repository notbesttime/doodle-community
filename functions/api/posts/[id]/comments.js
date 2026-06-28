// GET /api/posts/:id/comments - 获取评论列表（含点赞状态，软删除评论显示"已删除"）
// POST /api/posts/:id/comments - 发表评论
import { getUserFromRequest, json, cors, checkLevelUp, createMessage, checkRateLimit, checkIpBlacklist, filterSensitiveWords, updateDailyCount, updateTaskProgress } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

// 获取评论（含点赞状态 + 回复关系）
export async function onRequestGet({ params, request, env }) {
    try {
        const postId = params.id;
        const { results } = await env.DB.prepare(
            'SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC'
        ).bind(postId).all();

        const user = await getUserFromRequest(env, request);

        // 获取当前用户对所有评论的点赞状态
        let likeSet = new Set();
        if (user && results.length > 0) {
            const commentIds = results.map(c => c.id);
            const likesRes = await env.DB.prepare(
                `SELECT comment_id FROM comment_likes WHERE user_id = ? AND comment_id IN (${commentIds.join(',')})`
            ).bind(user.id).all();
            likeSet = new Set(likesRes.results.map(l => l.comment_id));
        }

        const comments = results.map(c => ({
            id: c.id,
            author: c.author_name,
            authorId: c.user_id,
            text: c.is_deleted ? '该评论已删除' : c.content,
            isDeleted: c.is_deleted === 1,
            likesCount: c.likes_count,
            parentId: c.parent_id,
            time: formatTime(c.created_at),
            liked: likeSet.has(c.id)
        }));

        return json({ comments });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}

// 发评论（支持回复，传 parentId 则为回复评论）
export async function onRequestPost({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        // IP黑名单检查
        const ipInfo = await checkIpBlacklist(env, request);
        if (ipInfo.blocked) return json({ error: '您的IP已被封禁' }, 403);

        const postId = params.id;
        const { text, parentId } = await request.json();
        if (!text || !text.trim()) return json({ error: '请输入评论内容' }, 400);
        if (text.trim().length > 500) return json({ error: '评论不能超过500字' }, 400);

        if (!await checkRateLimit(env.KV, 'comment:' + user.id, 5, 60, env.DB)) {
            return json({ error: '评论过于频繁，请稍后再试' }, 429);
        }

        const post = await env.DB.prepare('SELECT id, user_id FROM posts WHERE id = ?').bind(postId).first();
        if (!post) return json({ error: '帖子不存在' }, 404);

        // 敏感词过滤
        const filteredText = filterSensitiveWords(text.trim());

        const result = await env.DB.prepare(
            'INSERT INTO comments (post_id, user_id, author_name, content, parent_id) VALUES (?, ?, ?, ?, ?)'
        ).bind(postId, user.id, user.nickname, filteredText, parentId || 0).run();

        await env.DB.prepare(
            'UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?'
        ).bind(postId).run();

        user.exp += 2;
        user.caps += 2;
        const leveledUp = checkLevelUp(user);
        await env.DB.prepare(
            'UPDATE users SET exp = ?, caps = ?, level = ? WHERE id = ?'
        ).bind(user.exp, user.caps, user.level, user.id).run();

        // 更新每日评论计数和任务进度
        const today = new Date().toISOString().slice(0, 10);
        await updateDailyCount(env, user.id, 'daily_comments', today);
        await updateTaskProgress(env, user.id, 'comment3', 3, today);

        if (post.user_id !== user.id) {
            await createMessage(env, post.user_id, 'comment', user.nickname, '评论了你的帖子', postId);
        }

        return json({
            comment: {
                id: result.meta.last_row_id,
                author: user.nickname,
                authorId: user.id,
                text: filteredText,
                isDeleted: false,
                parentId: parentId || 0,
                likesCount: 0,
                time: '刚刚',
                liked: false
            },
            user: { exp: user.exp, caps: user.caps, level: user.level, leveledUp },
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
    if (diff < 300) return '刚刚';
    const y = created.getFullYear();
    const m = created.getMonth() + 1;
    const d = created.getDate();
    const h = String(created.getHours()).padStart(2, '0');
    const min = String(created.getMinutes()).padStart(2, '0');
    return `${y}年${m}月${d}日 ${h}:${min}`;
}
