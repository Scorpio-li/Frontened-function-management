# 项目规则

以下规则在每次任务中都必须遵守，与 [AGENTS.md](../../AGENTS.md) 共同作为本仓库的协作约定。

## 1. 任务开始前先读 AGENTS.md

开始任何任务前，先完整阅读仓库根目录的 [AGENTS.md](../../AGENTS.md)，了解目录结构、架构契约、编码规范与修改边界，再动手改动。

## 2. 涉及需求先读 specs 索引

涉及需求、功能设计或行为变更时，先读 [.trae/specs/README.md](../specs/README.md)（specs 索引），定位相关 spec，再阅读具体的 `spec.md`、`tasks.md`、`checklist.md`，不要凭猜测实现。

## 3. 不要擅自提交

不得自行执行 `git commit`、`git push`、创建 PR、打标签等提交类操作。只有用户明确要求提交时才执行，且严格按用户说明的范围提交。

## 4. 非 dev 分支先新建分支再改文件

如果当前分支不是 `dev`，在修改、新增、删除任何文件之前，必须先新建分支，并在新分支上完成编辑。

- 新建分支前先确认当前分支：`git rev-parse --abbrev-ref HEAD`。
- 分支命名保持语义化，例如 `feat/<主题>`、`fix/<主题>`、`docs/<主题>`。
- 不要在 `master` / `main` 或其他非 `dev` 分支上直接改动文件。
