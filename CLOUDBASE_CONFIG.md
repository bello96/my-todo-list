# CloudBase 环境配置说明

## 配置方式

项目现在会自动从 `cloudbaserc.json` 文件中读取环境 ID，无需在代码中硬编码。

### cloudbaserc.json 配置示例

```json
{
  "version": "2.0",
  "envId": "your-cloudbase-env-id",
  "$schema": "https://framework-1258016615.tcloudbaseapp.com/schema/latest.json",
  "framework": {
    "name": "cloudbase-react-template",
    "plugins": {
      "client": {
        "use": "@cloudbase/framework-plugin-website",
        "inputs": {
          "outputPath": "dist",
          "buildCommand": "npm run build"
        }
      }
    }
  }
}
```

### 配置步骤

1. **获取环境 ID**：
   - 登录腾讯云控制台
   - 进入云开发控制台
   - 选择或创建环境
   - 复制环境 ID

2. **修改配置文件**：
   - 打开项目根目录的 `cloudbaserc.json`
   - 将 `envId` 字段的值替换为你的环境 ID

3. **验证配置**：
   - 启动开发服务器：`pnpm dev`
   - 在浏览器控制台查看是否正确加载环境 ID

## 优势

- ✅ **统一配置**：环境 ID 在一个地方配置，多处使用
- ✅ **版本控制友好**：避免在代码中硬编码敏感信息
- ✅ **环境切换简单**：只需修改配置文件即可切换环境
- ✅ **错误提示清晰**：配置错误时有明确的错误信息

## 注意事项

- 确保 `cloudbaserc.json` 文件在项目根目录
- `envId` 字段不能为空或默认值 "your-env-id"
- 开发环境下会在控制台打印环境 ID 用于调试
