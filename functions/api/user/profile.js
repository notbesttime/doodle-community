// GET /api/user/profile - 获取个人资料
// PUT /api/user/profile - 更新签名等
import { getUserFromRequest, json, cors, getExpToNext, getLevelColor, getUserTasks } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        // 获取发帖数
        const { count: postCount } = await env.DB.prepare(
            'SELECT COUNT(*) as count FROM posts WHERE user_id = ?'
        ).bind(user.id).first();

        const expToNext = getExpToNext(user.level);
        const levelColor = getLevelColor(user.level);

        const today = new Date().toISOString().slice(0, 10);
        const tasks = await getUserTasks(env, user.id, today);

        return json({
            id: user.id, uid: user.uid, username: user.username,
            nickname: user.nickname, email: user.email,
            email_verified: user.email_verified, avatar: user.avatar,
            signature: user.signature, level: user.level, exp: user.exp,
            expToNext, levelColor,
            caps: user.caps, rename_count: user.rename_count,
            followers: user.followers, following: user.following,
            postCount, tasks
        });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}

export async function onRequestPut({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const { signature, avatar } = await request.json();
        const updates = [];
        const params = [];

        if (signature !== undefined) {
            updates.push('signature = ?');
            params.push(signature.slice(0, 100));
        }
        if (avatar !== undefined) {
            updates.push('avatar = ?');
            params.push(avatar);
        }
        if (updates.length === 0) return json({ error: '没有要更新的内容' }, 400);

        params.push(user.id);
        await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

        return json({ success: true });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
