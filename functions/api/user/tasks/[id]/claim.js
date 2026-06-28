// POST /api/user/tasks/:id/claim - 领取任务奖励
import { getUserFromRequest, json, cors, claimTaskReward } from '../../../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestPost({ params, request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const taskId = params.id;
        if (!taskId) return json({ error: '缺少任务ID' }, 400);

        const today = new Date().toISOString().slice(0, 10);
        const result = await claimTaskReward(env, user.id, taskId, today);

        if (!result.success) return json({ error: result.message }, 400);

        // 更新用户数据
        const updatedUser = await env.DB.prepare(
            'SELECT exp, level, caps FROM users WHERE id = ?'
        ).bind(user.id).first();

        return json({
            ...result,
            user: updatedUser
        });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}
