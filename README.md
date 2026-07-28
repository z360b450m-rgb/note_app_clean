# Note App Clean

一个以错题整理和复习为核心的笔记应用，支持本地优先使用、登录认证、远程同步、复习记录和标签化管理。

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Stack](https://img.shields.io/badge/stack-Vue%203%20%2B%20TypeScript%20%2B%20FastAPI-orange)

<p align="center">
  <img src="screenshot_main.png" alt="Main workspace" width="45%" />
  <img src="screenshot_editor.png" alt="Editor view" width="45%" />
</p>

## Overview

这个项目最初是一个本地优先的错题本应用，当前已经扩展为：

- Vue 3 + TypeScript 前端
- FastAPI + SQLAlchemy + MySQL 后端
- Alembic 数据库迁移
- JWT 登录认证
- IndexedDB 本地缓存 + 远程 API 同步
- Electron 桌面端支持

它适合用来记录错题、整理笔记、做复习追踪，也适合作为一个前后端一体化练手项目。

## Current Features

- 错题本 / 笔记本管理
- 条目创建、编辑、删除、搜索
- 标签、学科、素材类型筛选
- 复习记录与统计
- 登录、注册、当前用户鉴权
- 本地离线数据存储
- 远程 MySQL 数据持久化
- Alembic 迁移管理
- Electron 桌面打包

## Tech Stack

### Frontend

- Vue 3
- TypeScript
- Vite
- Tailwind CSS
- Electron

### Backend

- FastAPI
- SQLAlchemy ORM
- MySQL
- Alembic
- PyJWT
- pwdlib / Argon2 password hashing

### Storage

- IndexedDB
- MySQL

## Project Structure

```text
notes-app-clean/
├─ alembic/                 # Alembic migration files
├─ electron/                # Electron main/preload
├─ src/
│  ├─ components/           # Vue UI components
│  ├─ composables/          # Frontend business logic
│  ├─ db_sql/               # FastAPI backend, models, routers, auth
│  ├─ services/             # API / local data access layer
│  ├─ types/                # TypeScript types
│  └─ utils/                # Utility functions
├─ tests/                   # E2E and related tests
├─ package.json
├─ requirements.txt
└─ alembic.ini
```

## Backend Highlights

当前后端已经包含这些核心能力：

- `users` 表与注册登录接口
- JWT access token 鉴权
- `/api/users/signup`
- `/api/login/access-token`
- `/api/users/me`
- materials / notebooks / entries / review_logs 相关路由
- Alembic 管理数据库结构变更

## Local Development

### Frontend

```bash
npm install
npm run dev
```

### Backend

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn src.db_sql.main:app --reload
```

## Environment Variables

项目使用 `.env` 管理后端配置，常见变量包括：

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=notes_app_db
JWT_SECRET_KEY=your_jwt_secret
ACCESS_TOKEN_EXPIRE_MINUTES=10080
```

如果你后续接入 Agent / LLM，也建议继续通过 `.env` 配置模型密钥。

## Database Migration

初始化 Alembic 后，常用命令是：

```bash
alembic revision --autogenerate -m "your message"
alembic upgrade head
```

## Notes

- 当前项目同时存在本地存储和远程后端两套数据路径
- 如果要做多用户严格隔离，建议继续补 `owner_id / user_id` 级别的数据归属设计
- 如果要继续扩展 AI Agent，推荐从只读分析型能力开始接入

## License

MIT
