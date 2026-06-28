// GET /api/auth/me - 获取当前登录用户
import { getUserFromRequest, json, cors, getExpToNext, getLevelColor } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '未登录' }, 401);

        return json({
            user: {
                id: user.id, uid: user.uid, username: user.username,
                nickname: user.nickname, email: user.email,
                email_verified: user.email_verified, avatar: user.avatar,
                signature: user.signature, level: user.level, exp: user.exp,
                expToNext: getExpToNext(user.level),
                levelColor: getLevelColor(user.level),
                caps: user.caps, rename_count: user.rename_count,
                followers: user.followers, following: user.following,
                role: user.role
            }
        });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
