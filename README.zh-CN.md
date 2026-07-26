# Vine 站点

[English](README.md) | **简体中文**

本仓库包含 Vine 框架的公开网站和文档，发布于 [vine.yorun.ai](https://vine.yorun.ai)。

Skel 语言和 skelc 文档由 [`skel-site`](https://github.com/yorun-ai/skel-site) 独立维护，发布于 [skel.yorun.ai](https://skel.yorun.ai)。

## 本地开发

需要 Node.js 20 或更高版本以及 pnpm。

```bash
pnpm install
pnpm dev:zh
```

使用 `pnpm dev` 或 `pnpm dev:en` 启动默认的英文站点。验证两个语言版本：

```bash
pnpm typecheck
pnpm build
```

## 版本管理

Vine 文档版本跟随 Vine 发布：

```bash
pnpm docusaurus docs:version 0.10.0
```

不要手工修改生成的版本快照。

## 参与贡献

文档归属、双语内容要求和验证步骤请参阅
[CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

Vine Site 使用 [Apache License 2.0](LICENSE) 开源。
