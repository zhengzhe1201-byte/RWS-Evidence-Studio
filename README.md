# RWS Evidence Studio

真实世界研究产品化交互 Demo。项目使用纯 HTML、CSS 和 JavaScript，可直接打开，也可部署到 GitHub Pages。

## 核心场景

以卜彦斌提供的 AECOPD 虚拟 CSV 演示：

病例入库 → 研究问题结构化 → 变量映射 → 队列筛选 → 质量检查 → 初步分析 → 证据摘要。

## 本地运行

可直接打开 `index.html`，也可以使用任意静态文件服务器：

```powershell
python -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 部署

整个目录均为静态资源，无需构建、无需数据库、无需外部 API。可以直接交给 GitHub Pages、Netlify、Vercel 或 Trae Work 进行公网部署。

## 演示声明

全部患者均为虚拟数据。页面保留 PATIENTS、ADMISSIONS、DIAGNOSES_ICD、PRESCRIPTIONS、ICUSTAYS 五张原始表，并由确定性规则派生 index admission、Tiotropium 暴露和 30 天全因再入院。统计结果仅用于展示软件工作流，不构成正式真实世界证据、医学建议或因果结论。

## 更新数据包

从项目根目录运行：

```powershell
node .\RWS-Evidence-Studio\tools\build-aecopd-data.mjs
```

该脚本把 `AECOPD虚拟数据/*.csv` 转成静态 `aecopd-data.js`，因此页面无需后端，既可直接打开也可部署至 GitHub Pages。
