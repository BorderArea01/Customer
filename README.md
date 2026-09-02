# 数字员工前台大屏（Customer）

面向展厅、前台和会议室屏幕的 Android 接待终端。应用使用 Vue 3 + Vite 构建 Web 界面，并通过 Capacitor 封装为 Android 应用。

## 运行边界

- **展厅模式**：可使用静默登录身份；按住说话和正脸自动监听是独立的语音触发方式。
- **门控模式**：必须先由 CompreFace 识别出具体人员，后续对话才进入该人员的业务链路；语音触发方式不决定身份来源。
- 设备绑定、数字员工关系和业务接口由平台提供；终端的运行参数应在设置中心维护，不能将设备专属凭据写进源码。
- 访客审批、员工权限、门禁和机器人带路均属于后端工作流职责。前台只提交其应有的身份与业务上下文。

## 目录

```text
src/                 Vue 页面、组件、Pinia 状态、服务与业务流程
plugins/             自研 Capacitor 插件（检测、FunASR、语音、SSDP）
public/              Live2D、视觉模型、公告等静态资源
android/             Capacitor Android 工程
scripts/             插件安装、构建与 Android 打包脚本
```

`src/**/*.ts` 和 `src/**/*.vue` 是源码；不要提交由类型检查错误生成的同名 `.js` 副本。

## 本地开发

先安装与 `pnpm-lock.yaml` 匹配的依赖：

```powershell
pnpm install
pnpm dev
```

常用检查与构建：

```powershell
pnpm type-check
pnpm build
pnpm cap:build
pnpm build:android
```

`pnpm build` 会先构建自研插件、执行类型检查，再生成 `dist`。`dist`、`node_modules`、插件内部依赖和 Android/Gradle 构建缓存均为可再生成内容，不应提交。

## Android 安装与升级

应用 ID 为 `com.lzwcai.demp.customer.v2`。日常升级必须保持相同包名和签名，使用覆盖安装：

```powershell
adb -s <device> install -r --no-streaming <apk>
```

不要使用卸载、`pm clear` 或更换签名作为升级步骤；这些操作会清除设备本地设置。主动卸载前，应从设置中心导出配置备份。

`android/app/debug.keystore` 是当前调试包签名连续性所需文件，应按敏感构建材料保管，不要随意替换。

## 终端配置与安全

- 通过应用设置中心配置 API、MQTT、ASR/TTS、摄像头、语音、CompreFace、主题和更新参数。
- 配置导入导出仅用于设备迁移；不要把含有密码、令牌或 API Key 的导出文件提交到 Git。
- `local.properties`、本机调试目录、临时截图和 Codex 调试快照都不属于源码。
- 修改门控、访客或门禁链路时，先在隔离设备验证身份参数和工作流边界，不能以“兼容”为由删掉前台的人脸身份参数。

## 验收清单

1. 设备激活/绑定后能够进入主界面或配置向导。
2. 展厅和门控模式分别验证身份来源、按住说话、正脸自动监听与 ASR/TTS。
3. 验证摄像头预览方向、人脸识别、访客预约和刷新识别。
4. Android 覆盖安装后，确认设备本地配置仍保留。

## 维护约定

- 规范仓库：<https://github.com/BorderArea01/Customer>
- 只提交源码、锁文件、必要静态资源和可审查的配置模板。
- 发布 APK/AAB 请使用 GitHub Release 或受控制品库，不要提交到仓库根目录。
