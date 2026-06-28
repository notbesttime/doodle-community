// POST /api/posts/:id/tip - 投盖
// GET /api/posts/:id/tip - 查询投盖状态
import { getUserFromRequest, json, cors, checkIpBlacklist, tipPost, getTipStatus, getDailyTipsUsed } from '../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const ipInfo = await checkIpBlacklist(env, request);
        if (ipInfo.blocked) return json({ error: '您的IP已被封禁' }, 403);

        const postId = params.id;
        const { amount } = await request.json();
        if (!amount || (amount !== 1 && amount !== 2)) {
            return json({ error: '投盖数量只能是1或2' }, 400);
        }

        const result = await tipPost(env, user, postId, amount);
        return json(result, result.success ? 200 : 400);
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}

export async function onRequestGet({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        const postId = params.id;
        const status = await getTipStatus(env, user?.id, postId);
        // 补充每日额度信息
        let dailyUsed = 0;
        if (user) {
            dailyUsed = await getDailyTipsUsed(env, user.id);
        }
        return json({ ...status, dailyUsed, dailyLimit: 10 });
    } catch (e) {
        return json({ error: '服务器错误' }, 500);
    }
}
