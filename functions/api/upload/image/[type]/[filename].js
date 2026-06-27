// GET /api/upload/image/[type]/[filename] - 从 R2 读取图片
import { cors } from '../../_lib/utils.js';

export async function onRequestOptions() { return cors(); }

export async function onRequestGet({ params, env }) {
    try {
        const filename = `${params.type}/${params.filename}`;
        const object = await env.R2.get(filename);

        if (!object) return new Response('Not Found', { status: 404 });

        const headers = new Headers();
        headers.set('Content-Type', object.httpMetadata.contentType || 'image/jpeg');
        headers.set('Cache-Control', 'public, max-age=31536000');

        return new Response(object.body, { headers });
    } catch (e) {
        return new Response('Error', { status: 500 });
    }
}
