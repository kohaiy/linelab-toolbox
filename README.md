# 行间 LineLab

一个纯静态、零依赖的浏览器工具箱，部署在 GitHub Pages 上即可使用。文本处理只是其中一类，另外还有数据格式、开发辅助、随机生成器和图片工具，共 **24 个**小工具。

所有转换都在浏览器本地完成，没有后端、没有账号、没有上传请求。

## 工具清单

| 分类 | 工具 |
| --- | --- |
| 文本处理 | 行转引号、列表还原、行号与前后缀、去重排序、空白清理、查找替换、命名转换、文本统计 |
| 数据格式 | JSON 格式化、CSV 转 JSON、JSON 转 CSV |
| 开发工具 | 编码解码、时间戳转换、JWT 解码、URL 解析、颜色转换、正则测试、哈希计算 |
| 生成器 | UUID 生成、随机密码、随机数、随机打乱 |
| 图片工具 | 图片转 Base64、SVG 转 Data URI |

几个有代表性的能力：

- **行转引号**：把多行文本变成 `'123',` 这样的 SQL / 数组列表，支持 SQL 双写引号、反斜杠转义、自定义引号、前后缀包裹。
- **数据格式**：JSON 错误会定位到行列；CSV 解析支持引号字段、字段内换行、自动识别分隔符和类型推断。
- **开发工具**：时间戳支持秒/毫秒自动识别与双向转换；JWT 只解码不验证签名；颜色支持 HEX / RGB / HSL / HSV。
- **图片工具**：图片通过 `FileReader` 在本地读取后转为 Data URI，文件不会离开浏览器。

## 本地预览

项目是纯静态文件，直接双击 `index.html` 也能查看，但建议用本地 HTTP 服务（部分浏览器 API 需要安全上下文）：

```bash
# 有 Python 时
python3 -m http.server 8080

# 或使用 Node
npx --yes serve .
```

然后打开 `http://localhost:8080`。

## 运行测试

工具内核是纯函数，浏览器和 Node 共用。测试覆盖 24 个工具的转换逻辑、边界情况与错误处理：

```bash
npm test
# 等价于
node tests/tools.test.js
```

> 注意：在部分受限环境里 `node --test tests/` 会因创建子进程失败而报 `spawn EPERM`，直接运行测试文件即可。

## 部署到 GitHub Pages

1. 新建一个 GitHub 仓库，把本项目根目录下的文件推送到仓库根目录。
2. 打开仓库的 **Settings → Pages**。
3. 在 **Build and deployment** 中把 **Source** 设为 **GitHub Actions**。
4. 推送到 `main` 分支，或手动运行一次 **Deploy static site to GitHub Pages** workflow。
5. 部署完成后访问：

   ```text
   https://<你的用户名>.github.io/<仓库名>/
   ```

仓库已包含 `.github/workflows/pages.yml`，它会只把 `index.html`、`assets/`、`.nojekyll` 和 `robots.txt` 复制到发布目录，不会把测试文件发布出去。

也可以不用 Actions：把 **Source** 设为 **Deploy from a branch**，选择 `main` 分支的 `/ (root)` 目录即可。`.nojekyll` 已包含，避免 GitHub 用 Jekyll 处理静态资源。

### 部署到子路径

站点使用 hash 路由（`#/line-quotes`），所有资源都通过相对路径加载，因此放在 `https://<用户名>.github.io/<仓库名>/` 这样的子路径下不需要改配置。

## 项目结构

```text
.
├── index.html                     # 站点外壳、首页、工具页骨架
├── assets/
│   ├── styles.css                 # 全部样式、主题、响应式
│   ├── app.js                     # 路由、搜索、选项、复制下载、图片工具
│   ├── tools.js                   # 24 个工具的定义与纯函数转换内核
│   └── favicon.svg
├── tests/
│   ├── tools.test.js              # 转换内核：边界、异步、错误处理
│   └── app-structure.test.js      # HTML / JS 引用与部署文件的一致性检查
├── .github/workflows/pages.yml    # GitHub Pages 部署
├── .nojekyll
├── robots.txt
├── package.json
└── LICENSE
```

## 新增一个工具

在 `assets/tools.js` 的 `tools` 数组里追加一个对象即可，界面会自动生成：

```js
{
  id: 'my-tool',
  name: '我的工具',
  short: '一句话说明',
  description: '更详细的说明，会显示在工具页标题下方。',
  category: 'text', // text | data | dev | generate | image
  glyph: 'Aa',
  keywords: ['关键词'],
  tags: ['标签'],
  inputPlaceholder: '输入提示',
  outputPlaceholder: '输出提示',
  sample: '示例输入',
  options: [
    { id: 'enabled', type: 'checkbox', label: '启用', value: true },
    { id: 'mode', type: 'segmented', label: '模式', value: 'a', choices: [
      { value: 'a', label: '模式 A' },
      { value: 'b', label: '模式 B' }
    ] }
  ],
  tips: ['使用提示'],
  transform: function (input, options) {
    return { text: input, detail: '完成' };
  }
}
```

可用的选项类型：`text`、`number`、`checkbox`、`select`、`segmented`。如果工具不需要输入区，加 `showInput: false`，输出区会占满整行；生成器类工具会显示「重新生成」按钮。

### 自定义交互工具

图片转 Base64 是一个 `custom: 'image-base64'` 工具，由 `assets/app.js` 里的 `renderCustomTool` 单独渲染，因此可以接入文件选择、预览、下载等交互。新增自定义工具时，在注册表里加 `custom` 标识，并在 `renderCustomTool` 中增加对应分支。

## 浏览器支持

面向现代浏览器（Chrome / Edge / Firefox / Safari 最近版本）。用到的 API：

- FileReader / Canvas / Blob（图片与下载）
- Web Crypto（哈希、UUID、密码、随机数）
- Intl.Collator / Intl.NumberFormat
- CSS 自定义属性、`inert`、`clamp()`

哈希与安全随机数依赖安全上下文；部署到 GitHub Pages 的 HTTPS 环境完全可用。若用 `file://` 打开，部分浏览器会限制 Web Crypto。

## 隐私说明

- 页面没有后端接口，转换结果不会离开浏览器。
- 工具选项和主题偏好保存在 `localStorage`，输入内容不保存。
- 图片通过本地 `FileReader` 读取，不会上传。
- JWT 工具只做 Base64URL 解码，不验证签名，也不能用于判断 Token 是否可信。

## License

MIT © [kohaiy](https://github.com/kohaiy)
