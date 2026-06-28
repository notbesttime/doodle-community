// GET /api/user/tasks - 获取用户任务列表和进度
import { getUserFromRequest, json, cors, getUserTasks } from '../lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUserFromRequest(env, request);
        if (!user) return json({ error: '请先登录' }, 401);

        const today = new Date().toISOString().slice(0, 10);
        const tasks = await getUserTasks(env, user.id, today);
        return json({ tasks, today });
    } catch (e) {
        return json({ error: '服务器错误: ' + e.message }, 500);
    }
}