# 自动化流程

该目录保存 VOZEB PRO 的 GitHub Actions 工作流，用于提交质量检查和多架构容器镜像发布。

- `quality.yml`：检查主应用与文档站的格式、类型、测试、构建和发布条件。
- `docker-image.yml`：构建并发布主应用多架构镜像。
- `docs-docker-image.yml`：构建并发布文档站多架构镜像。

`main` 分支用于持续集成，`v*` 标签用于正式版本镜像发布。
