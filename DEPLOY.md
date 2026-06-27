# 乱涂彩社区 - 部署指南

## 前置条件

1. 注册 [Cloudflare](https://dash.cloudflare.com) 账号（免费）
2. 安装 Node.js 18+
3. 安装 Wrangler CLI：`npm install -g wrangler`
4. 登录：`wrangler login`

---

## 部署步骤

### Step 1: 创建 D1 数据库

```bash
wrangler d1 create doodle-community-db
```
将返回的 `database_id` 填入 `wrangler.toml`。

### Step 2: 导入数据库 Schema

```bash
wrangler d1 execute doodle-community-db --file=schema.sql
```

### Step 3: 创建 R2 存储桶

```bash
wrangler r2 bucket create doodle-community-images
```

### Step 4: 创建 KV 命名空间

```bash
wrangler kv namespace create KV
```
将返回的 `id` 填入 `wrangler.toml`。

### Step 5: 配置 EmailJS（邮件验证码）

1. 注册 [EmailJS](https://www.emailjs.com/)
2. 添加 Email Service（选QQ邮箱，用你的QQ邮箱授权）
3. 创建 Email Template，模板变量：`{{to_email}}`、`{{code}}`、`{{site_name}}`
4. 获取三个值：Service ID、Template ID、Public Key
5. 在 Cloudflare Pages 面板设置环境变量：
   - `EMAILJS_SERVICE_ID`
   - `EMAILJS_TEMPLATE_ID`
   - `EMAILJS_PUBLIC_KEY`

### Step 6: 部署

```bash
wrangler pages deploy public
```

部署成功后会获得 `xxx.pages.dev` 域名。

### Step 7: 设置管理员

部署后，注册你的账号，然后在 D1 面板执行：
```sql
UPDATE users SET role = 'admin' WHERE username = '你的用户名';
```

---

## 本地开发

```bash
# 安装依赖
npm install

# 本地开发（含 Functions 本地模拟）
npm run dev

# 仅前端预览（无后端）
cd public && python -m http.server 8888
```

---

## 项目结构

```
doodle-community/
├── public/              ← 前端静态文件（Pages 根目录）
│   ├── index.html
│   ├── css/style.css
│   ├── js/
│   │   ├── api.js       ← API 客户端
│   │   └── app.js       ← 应用逻辑
│   └── assets/
│       └── sponsor/     ← 收款二维码
├── functions/           ← Pages Functions（自动成为 /api/* 路由）
│   └── api/
│       ├── _lib/utils.js       ← 共享工具
│       ├── auth/               ← 认证 API
│       ├── posts/              ← 帖子 API
│       ├── community/          ← 签到 API
│       ├── user/               ← 用户 API
│       ├── messages/           ← 消息 API
│       ├── ranks/              ← 排行榜 API
│       └── upload/             ← 图片上传 API
├── schema.sql           ← 数据库建表语句
├── wrangler.toml        ← Cloudflare 配置
└── package.json
```

## API 接口列表

| 方法 | 路径 | 功能 |
|:---|:---|:---|
| POST | /api/auth/register | 注册 |
| POST | /api/auth/login | 登录 |
| GET | /api/auth/me | 获取当前用户 |
| POST | /api/auth/logout | 退出登录 |
| POST | /api/auth/send-code | 发送验证码 |
| POST | /api/auth/verify-code | 验证验证码 |
| POST | /api/auth/forgot-password | 忘记密码重置 |
| GET | /api/posts | 帖子列表 |
| POST | /api/posts | 发帖 |
| GET | /api/posts/:id | 帖子详情 |
| GET | /api/posts/:id/comments | 评论列表 |
| POST | /api/posts/:id/comments | 发评论 |
| POST | /api/posts/:id/like | 点赞 |
| DELETE | /api/posts/:id/like | 取消点赞 |
| POST | /api/posts/:id/favorite | 收藏 |
| DELETE | /api/posts/:id/favorite | 取消收藏 |
| POST | /api/community/signin | 签到 |
| GET | /api/community/signin/status | 签到状态 |
| GET | /api/user/profile | 个人资料 |
| PUT | /api/user/profile | 更新资料 |
| PUT | /api/user/rename | 改名 |
| GET | /api/user/favorites | 我的收藏 |
| GET | /api/messages | 消息列表 |
| PUT | /api/messages/:id/read | 标记已读 |
| GET | /api/ranks/:type | 排行榜列表 |
| POST | /api/ranks/apply | 申请上榜 |
| POST | /api/upload/image | 上传图片 |
