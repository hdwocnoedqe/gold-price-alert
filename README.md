# 黄金价格提醒

一个本机或云端运行的黄金价格提醒网页应用。页面显示 `XAU/USD` 当前价格，单位是美元/盎司，并支持两种涨跌幅提醒：

- 参考价 + 提醒阈值
- N 分钟内涨跌超过阈值

页面默认每 30 分钟自动刷新一次价格，适合先用免费 GoldAPI 额度验证。

## 本地启动

先在 `.env` 文件里配置 GoldAPI 密钥：

```text
GOLDAPI_KEY=你的 GoldAPI key
```

启动服务：

```powershell
npm start
```

如果 PowerShell 提示无法运行 `npm.ps1`，可以改用：

```powershell
node server.js
```

打开：

```text
http://localhost:3000
```

如果接口暂时不可用，可以用测试价格模式：

```powershell
$env:USE_MOCK_PRICE="1"
npm start
```

如果遇到同样的 PowerShell 限制，可以把最后一行换成 `node server.js`。

## 免费部署到 Render

1. 把项目上传到 GitHub 仓库。
2. 登录 Render，创建 `Web Service`。
3. 选择刚才的 GitHub 仓库。
4. Runtime 选择 `Node`。
5. Build Command 可以留空。
6. Start Command 填写：

```text
npm start
```

7. 在 Environment Variables 里添加：

```text
GOLDAPI_KEY=你的 GoldAPI key
```

8. 部署完成后，使用 Render 提供的网址访问网页，不再使用 `localhost:3000`。

## 免费版注意事项

- 免费服务长时间没人访问时可能会休眠，第一次打开可能需要等一会儿。
- GoldAPI 免费额度有限，所以当前版本默认 30 分钟刷新一次。
- GoldAPI key 只放在 `.env` 或 Render 环境变量里，不要写进网页文件。

## 测试

```powershell
npm test
```

如果 PowerShell 提示无法运行 `npm.ps1`，可以改用：

```powershell
node scripts/test-alerts.js
```
