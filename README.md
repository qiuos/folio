# Folio — 私人在线图书馆

独立、完整的私人在线图书馆系统。上传、整理、阅读，一站式管理你的藏书。

## 特性

- **📚 完整图书管理** — 自主上传 EPUB/PDF/MOBI 等格式，自动提取 ISBN 并匹配元数据（豆瓣、Google Books、Open Library）
- **📖 在线阅读** — 浏览器内阅读 EPUB 和 PDF，支持笔记标注
- **🔍 灵活浏览** — 按分类、标签、丛书、书架浏览，全文搜索
- **📡 OPDS 服务** — 兼容任何 OPDS 阅读器 App（KyBook、Marvin 等）
- **🔐 私密安全** — JWT 认证，单用户/家庭使用，数据完全自控
- **🐳 Docker 一键部署** — Docker Compose 启动，Caddy 反代，开箱即用
- **🎨 Apple 风格设计** — Apple Design 灵感，卡片式布局，响应式适配桌面与移动端

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19, Vite, Tailwind CSS 4, shadcn/ui, Zustand |
| 后端 | FastAPI, SQLModel, SQLite, JWT |
| 部署 | Docker Compose, Caddy |
| 阅读 | EPUB.js, PDF.js |

## 快速开始

### Docker 部署（推荐）

```bash
# 1. 克隆仓库
git clone git@github.com:qiuos/folio.git
cd folio

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，修改 JWT_SECRET_KEY 和 ADMIN_PASSWORD

# 3. 启动
docker compose up -d

# 4. 访问
# 前端: http://localhost:3000
# API:  http://localhost:8000/docs
```

### 本地开发

**后端**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
cp ../.env.example ../.env  # 编辑配置
uvicorn app.main:app --reload --port 8000
```

**前端**

```bash
cd frontend
npm install
npm run dev  # http://localhost:5173
```

## 环境变量

关键配置项见 `.env.example`：

| 变量 | 说明 |
|------|------|
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 管理员账户 |
| `JWT_SECRET_KEY` | JWT 签名密钥（务必修改） |
| `DATABASE_URL` | 数据库路径，默认 `sqlite:///data/folio.db` |
| `BOOKS_STORAGE_PATH` | 图书文件存储目录 |
| `METADATA_PROVIDERS` | 元数据源，支持 `douban,isbn_cn,google_books,open_library` |
| `OPDS_ENABLED` | 是否开启 OPDS 服务 |
| `MAX_UPLOAD_SIZE` | 上传文件大小上限（字节） |
| `ALLOWED_FORMATS` | 支持的图书格式 |

## 目录结构

```
folio/
├── frontend/            # React SPA
│   └── src/
│       ├── api/         # API 请求层
│       ├── pages/       # 页面组件
│       ├── store/       # Zustand 状态
│       └── types/       # TypeScript 类型
├── backend/             # FastAPI 应用
│   └── app/
│       ├── api/v1/      # REST API 路由
│       ├── api/opds/    # OPDS 路由
│       ├── models/      # SQLModel 定义
│       ├── services/    # 业务逻辑（元数据等）
│       └── core/        # 安全、异常处理
├── docker-compose.yml   # 容器编排
├── Dockerfile.backend   # 后端镜像
├── Dockerfile.frontend  # 前端镜像
└── Caddyfile            # 反代配置
```

## License

MIT
