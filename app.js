(function () {
  const config = window.RWS_CONFIG;
  const patients = window.RWS_DATA.patients;
  const metadata = window.RWS_DATA.metadata;
  const stats = window.RWS_STATS;
  const root = document.getElementById("view-root");
  const nav = document.getElementById("nav");
  const title = document.getElementById("page-title");
  const drawer = document.getElementById("drawer");
  const backdrop = document.getElementById("drawer-backdrop");
  const toast = document.getElementById("toast");

  const state = {
    page: localStorage.getItem("rws-page") || "overview",
    workflowStep: Number(localStorage.getItem("rws-workflow-step") || 0),
    studyConfirmed: localStorage.getItem("rws-study-confirmed") === "true",
    governanceConfirmed: localStorage.getItem("rws-governance-confirmed") === "true",
    analysisPlanConfirmed: localStorage.getItem("rws-analysis-plan-confirmed") === "true",
    question: localStorage.getItem("rws-question") || config.study.naturalQuestion,
    analysisMethod: localStorage.getItem("rws-analysis-method") || "crude",
    caseSearch: "",
    diagnosisFilter: "全部",
    treatmentFilter: "全部"
  };
  if (!["全部", "已形成索引住院", "未形成索引住院"].includes(state.diagnosisFilter)) state.diagnosisFilter = "全部";
  if (!["全部", "Tiotropium", "其他标准治疗", "未分类"].includes(state.treatmentFilter)) state.treatmentFilter = "全部";
  if (!config.analysisMethods.some((method) => method.id === state.analysisMethod)) state.analysisMethod = "crude";

  function saveState() {
    localStorage.setItem("rws-page", state.page);
    localStorage.setItem("rws-workflow-step", String(state.workflowStep));
    localStorage.setItem("rws-study-confirmed", String(state.studyConfirmed));
    localStorage.setItem("rws-governance-confirmed", String(state.governanceConfirmed));
    localStorage.setItem("rws-analysis-plan-confirmed", String(state.analysisPlanConfirmed));
    localStorage.setItem("rws-question", state.question);
    localStorage.setItem("rws-analysis-method", state.analysisMethod);
  }

  function mean(values) {
    const valid = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
    return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  }
  function variance(values) {
    const m = mean(values);
    return values.length > 1 ? values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1) : 0;
  }
  function standardDeviation(values) { return Math.sqrt(variance(values)); }
  function quantile(values, probability) {
    const valid = values.filter((v) => typeof v === "number" && !Number.isNaN(v)).sort((a, b) => a - b);
    if (!valid.length) return 0;
    const index = (valid.length - 1) * probability;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return lower === upper ? valid[lower] : valid[lower] + (valid[upper] - valid[lower]) * (index - lower);
  }
  function meanSd(values, unit = "") { return `${mean(values).toFixed(1)} ± ${standardDeviation(values).toFixed(1)}${unit}`; }
  function medianIqr(values, unit = "") { return `${quantile(values, .5).toFixed(1)} [${quantile(values, .25).toFixed(1)}, ${quantile(values, .75).toFixed(1)}]${unit}`; }
  function countPercent(values, predicate) { const count = values.filter(predicate).length; return `${count} (${pct(count / Math.max(1, values.length))})`; }
  function pct(value, digits = 1) { return `${(value * 100).toFixed(digits)}%`; }
  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
  }

  function deriveCohort() {
    const stages = [];
    let current = [...patients];
    stages.push({ label: "全部虚拟患者", patients: current, reason: "PATIENTS.csv中的全部200名患者" });
    current = current.filter((p) => p.meetsAgeDiagnosis);
    stages.push({ label: "年龄与主要诊断符合", patients: current, reason: "至少一次住院年龄≥50岁且seq_num=1为49122/49322/496" });
    current = current.filter((p) => p.hasEligibleIndex);
    stages.push({ label: "形成首次合格索引住院", patients: current, reason: "取首次非择期、存活出院且具有处方记录的合格住院" });
    current = current.filter((p) => p.observationComplete);
    stages.push({ label: "具有完整30天观察窗口", patients: current, reason: `数据截止日${metadata.databaseEnd}，索引出院后可观察≥30天` });
    current = current.filter((p) => p.exposureClassified);
    stages.push({ label: "暴露状态可判定", patients: current, reason: "索引住院处方可划分Tiotropium暴露或其他标准治疗" });
    const treatment = current.filter((p) => p.tiotropiumExposed === true);
    const control = current.filter((p) => p.tiotropiumExposed === false);
    return { stages, final: current, treatment, control };
  }

  function deriveAnalysis() {
    const cohort = deriveCohort();
    return { ...cohort, ...stats.analyze(cohort.final, state.analysisMethod) };
  }

  function smdNumeric(a, b) {
    const av = a.filter((v) => typeof v === "number");
    const bv = b.filter((v) => typeof v === "number");
    const pooled = Math.sqrt((variance(av) + variance(bv)) / 2);
    return pooled ? Math.abs(mean(av) - mean(bv)) / pooled : 0;
  }
  function smdBinary(a, b) {
    const pa = a.filter(Boolean).length / Math.max(1, a.length);
    const pb = b.filter(Boolean).length / Math.max(1, b.length);
    const pooled = Math.sqrt((pa * (1 - pa) + pb * (1 - pb)) / 2);
    return pooled ? Math.abs(pa - pb) / pooled : 0;
  }

  function renderNav() {
    nav.innerHTML = config.navigation.map((item) => `
      <button class="nav-button ${state.page === item.id ? "active" : ""}" data-page="${item.id}">
        <span>${item.icon}</span><span>${item.label}</span>
      </button>`).join("");
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function go(page) {
    state.page = page;
    saveState();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function pageHeader(item) {
    title.textContent = item?.label || "RWS Evidence Studio";
  }

  function renderOverview() {
    const analysis = deriveAnalysis();
    return `
      <section class="hero">
        <div>
          <span class="hero-tag">PROTOCOL → GOVERNANCE → ANALYSIS → REPORT</span>
          <h2>把真实世界数据，组织成可确认、可复算、可审计的研究工作流</h2>
          <p>从研究方案预设开始，依次完成变量映射、队列构建、数据治理、分析方案确认、效应估计与报告输出。AI负责辅助理解和推荐，确定性代码负责筛选与计算，专业人员保留最终决策权。</p>
          <div class="hero-actions">
            <button class="primary-button" data-go="question">运行 AECOPD 示例</button>
            <button class="ghost-button" data-go="boundary">查看人机边界</button>
          </div>
        </div>
        <div class="hero-visual">
          <div class="orbit"></div><div class="orbit"></div>
          <div class="core-node">研究就绪<br>证据报告</div>
          <div class="orbit-node node-a">研究方案</div><div class="orbit-node node-b">数据治理</div>
          <div class="orbit-node node-c">统计分析</div><div class="orbit-node node-d">人工确认</div>
        </div>
      </section>

      <section class="grid grid-4 section-gap">
        ${metric("AECOPD虚拟患者", patients.length, "来自卜彦斌提供的五张MIMIC-III风格CSV", "▤")}
        ${metric("研究就绪队列", analysis.final.length, "首次合格住院且观察窗口完整", "◉")}
        ${metric("研究闭环步骤", 8, "覆盖方案、治理、分析和报告", "⌘")}
        ${metric("医疗AI定位", config.product.aiLevel, "专业人员确认研究方案与统计结论", "AI")}
      </section>

      <section class="card section-gap">
        <div class="card-header"><div><h3>升级后的研究闭环</h3><p>质量问题会进入分析方案，不再停留在提示层面。</p></div><span class="badge green">Study-ready workflow</span></div>
        <div class="flow">
          ${["研究方案", "变量映射", "队列构建", "数据治理", "分析方案", "效应估计", "敏感性分析", "研究报告"].map((x, i) => `<div class="flow-step"><span>STEP ${i + 1}</span><strong>${x}</strong></div>`).join("")}
        </div>
      </section>

      <section class="grid grid-2 section-gap">
        <div class="card">
          <div class="card-header"><div><h3>产品服务谁</h3><p>围绕真实研究岗位组织信息，而不是做通用医学问答。</p></div><span class="badge blue">${config.product.aiLevel}</span></div>
          <ul class="list-clean">
            <li><strong>主要用户：</strong>${config.product.primaryUser}</li>
            <li><strong>协同用户：</strong>${config.product.collaborators}</li>
            <li><strong>产品定位：</strong>${config.product.positioning}</li>
            <li class="check">减少取数、清洗、口径核对和报告整理的重复劳动</li>
            <li class="cross">不替代统计师决定因果假设、模型和正式结论</li>
          </ul>
        </div>
        <div class="card">
          <div class="card-header"><div><h3>当前示例研究</h3><p>围绕一个具体问题贯通完整流程。</p></div><span class="badge blue">回顾性队列</span></div>
          <h3>${config.study.title}</h3>
          <ul class="list-clean section-gap">
            <li><strong>主要终点：</strong>${config.study.primaryEndpoint}</li>
            <li><strong>估计目标：</strong>${config.study.estimand}</li>
            <li><strong>建议主分析：</strong>倾向评分加权（IPTW）</li>
            <li><strong>证据定位：</strong>虚拟数据中的探索性关联</li>
          </ul>
        </div>
      </section>`;
  }

  function metric(label, value, note, icon) {
    return `<div class="card metric-card"><span class="metric-icon">${icon}</span><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-note">${note}</div></div>`;
  }

  function renderCases() {
    const filtered = patients.filter((p) => {
      const search = state.caseSearch.trim().toLowerCase();
      return (!search || p.id.toLowerCase().includes(search) || p.name.includes(search))
        && (state.diagnosisFilter === "全部" || (state.diagnosisFilter === "已形成索引住院" ? p.hasEligibleIndex : !p.hasEligibleIndex))
        && (state.treatmentFilter === "全部" || p.treatment === state.treatmentFilter);
    });
    return `
      <section class="grid grid-4">
        ${metric("患者总数", patients.length, "PATIENTS.csv记录数", "▤")}
        ${metric("合格索引住院", patients.filter(p => p.hasEligibleIndex).length, "首次满足书面纳排标准", "◎")}
        ${metric("Tiotropium暴露", patients.filter(p => p.tiotropiumExposed).length, "研究就绪队列暴露组", "Rx")}
        ${metric("30天全因再入院", patients.filter(p => p.hasEligibleIndex && p.readmitted30d).length, "合格索引住院后的事件数", "↻")}
      </section>
      <section class="card section-gap">
        <div class="card-header"><div><h3>患者病例库</h3><p>查看患者、住院、诊断、处方和ICU原始记录。当前显示 ${filtered.length} 条。</p></div><span class="badge gray">数据截止 ${metadata.databaseEnd}</span></div>
        <div class="filters">
          <input id="case-search" class="input" placeholder="搜索患者编号或姓名" value="${esc(state.caseSearch)}" />
          <select id="diagnosis-filter" class="select"><option>全部</option><option ${state.diagnosisFilter === "已形成索引住院" ? "selected" : ""}>已形成索引住院</option><option ${state.diagnosisFilter === "未形成索引住院" ? "selected" : ""}>未形成索引住院</option></select>
          <select id="treatment-filter" class="select"><option>全部</option><option ${state.treatmentFilter === "Tiotropium" ? "selected" : ""}>Tiotropium</option><option ${state.treatmentFilter === "其他标准治疗" ? "selected" : ""}>其他标准治疗</option><option ${state.treatmentFilter === "未分类" ? "selected" : ""}>未分类</option></select>
        </div>
        <div class="table-wrap"><table><thead><tr><th>患者</th><th>索引住院</th><th>主要ICD-9</th><th>年龄</th><th>既往住院</th><th>暴露分组</th><th>30天再入院</th><th>数据来源</th></tr></thead>
          <tbody>${filtered.slice(0, 60).map(p => `<tr>
            <td><button class="table-link" data-patient="${p.id}">${p.id}</button><div class="muted">${p.name} · ${p.age}岁</div></td>
            <td>${p.encounterId ? `${p.encounterId}<div class="muted">${p.dischargeDate}</div>` : '<span class="badge red">未形成</span>'}</td><td>${p.primaryDiagnosisCode ?? "—"}</td><td>${p.age ?? "—"}</td><td>${p.priorAdmissions ?? "—"}</td>
            <td><span class="badge ${p.tiotropiumExposed === true ? "green" : p.tiotropiumExposed === false ? "blue" : "gray"}">${p.treatment}</span></td>
            <td><span class="badge ${p.readmitted30d ? "red" : "gray"}">${p.readmitted30d == null ? "—" : p.readmitted30d ? "是" : "否"}</span></td><td>单一模拟住院源</td>
          </tr>`).join("")}</tbody></table></div>
      </section>`;
  }

  function renderQuestion() {
    return `
      <section class="grid grid-2">
        <div>
          <div class="question-box">
            <label>输入一个真实世界研究问题</label>
            <textarea id="research-question" class="textarea">${esc(state.question)}</textarea>
            <div class="question-actions">
              <div class="template-pills"><button class="template-pill active">30天再入院</button><button class="template-pill" data-preview="AE/SAE">AE/SAE（待配置）</button><button class="template-pill" data-preview="依从性">用药依从性（待配置）</button></div>
              <button id="run-agents" class="primary-button">运行 Agent 工作流</button>
            </div>
          </div>
          <div class="card section-gap">
            <div class="card-header"><div><h3>Agent 执行链</h3><p>Agent生成研究方案初稿，专业人员逐项确认。</p></div></div>
            <div class="agent-list">
              ${config.agents.map((a, i) => `<div class="agent-row ${state.workflowStep > i ? "done" : state.workflowStep === i && state.workflowStep > 0 ? "running" : ""}"><div class="agent-index">${state.workflowStep > i ? "✓" : i + 1}</div><div><strong>${a.name}</strong><small>${a.desc}</small></div><div class="agent-status">${state.workflowStep > i ? "已完成" : state.workflowStep === i && state.workflowStep > 0 ? "执行中…" : "等待"}</div></div>`).join("")}
            </div>
          </div>
        </div>
        <div class="grid">
          <div class="card">
            <div class="card-header"><div><h3>结构化研究方案</h3><p>在取数与分析前预先明确研究设计。</p></div><span class="badge ${state.studyConfirmed ? "green" : "amber"}">${state.studyConfirmed ? "已人工确认" : "等待确认"}</span></div>
            <div class="definition-grid">
              ${definition("研究设计", config.study.design)}
              ${definition("研究目的", config.study.objective)}
              ${definition("P · 研究对象", config.study.population)}${definition("E · 暴露", config.study.exposure)}
              ${definition("C · 对照", config.study.comparator)}${definition("INDEX · 索引日期", config.study.indexDate)}
            </div>
          </div>
          <div class="card">
            <div class="card-header"><div><h3>研究终点与估计目标</h3><p>终点和效应指标在查看结果前预先确定。</p></div><span class="badge blue">Pre-specified</span></div>
            <div class="endpoint-card primary-endpoint"><span>主要终点</span><strong>${config.study.primaryEndpoint}</strong></div>
            <div class="section-gap"><h4>次要终点</h4><ul class="list-clean">${config.study.secondaryEndpoints.map((endpoint) => `<li class="check">${endpoint}</li>`).join("")}</ul></div>
            <div class="definition-grid section-gap">
              ${definition("估计目标", config.study.estimand)}
              ${definition("分析人群", config.study.analysisPopulation)}
              ${definition("研究假设", config.study.hypothesis)}
              ${definition("当前不支持", config.study.unsupportedEndpoints)}
            </div>
          </div>
          <div class="card">
            <div class="grid grid-2">
              <div><h4>纳入标准</h4><ul class="list-clean">${config.study.inclusions.map(x => `<li class="check">${x}</li>`).join("")}</ul></div>
              <div><h4>排除标准</h4><ul class="list-clean">${config.study.exclusions.map(x => `<li class="cross">${x}</li>`).join("")}</ul></div>
            </div>
            <div class="section-gap"><h4>建议控制的混杂因素</h4><div class="template-pills section-gap">${config.study.confounders.map(x => `<span class="template-pill active">${x}</span>`).join("")}</div></div>
            <div class="alert amber section-gap"><strong>!</strong><div><b>人工确认边界：</b>主要/次要终点、混杂因素、估计目标及其时间顺序必须由研究医生和统计师确认，Agent只生成方案初稿。</div></div>
            <div class="section-gap"><button id="confirm-study" class="${state.studyConfirmed ? "secondary-button" : "primary-button"}">${state.studyConfirmed ? "研究方案已确认，进入变量中心" : "人工确认研究方案"}</button></div>
          </div>
        </div>
      </section>`;
  }

  function definition(label, value) { return `<div class="definition-item"><span>${label}</span><strong>${value}</strong></div>`; }

  function rawTable(titleText, rows, columns) {
    if (!rows?.length) return `<h3 class="section-gap">${titleText}</h3><div class="raw-text">无记录</div>`;
    return `<h3 class="section-gap">${titleText} <span class="badge gray">${rows.length}条</span></h3><div class="table-wrap"><table><thead><tr>${columns.map(([label]) => `<th>${label}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${columns.map(([, key]) => `<td>${esc(row[key] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }

  function renderVariables() {
    const cohort = deriveCohort();
    const rows = config.variableDictionary.map(v => {
      const missing = patients.filter(p => p[v.key] == null).length / patients.length;
      const available = v.available !== false && missing < .2;
      const status = v.available === false ? "数据源缺失" : available ? "研究可用" : "需要核查";
      return `<tr data-variable="${v.key}"><td><button class="table-link" data-variable="${v.key}">${v.label}</button><div class="muted mono">${v.key}</div></td><td><span class="badge ${v.type === "结局" ? "red" : v.type === "暴露" ? "green" : "blue"}">${v.type}</span></td><td><span class="source-tag">${v.source}</span><div class="muted mono">${v.raw}</div></td><td class="progress-cell"><div class="progress-track"><div class="progress-fill" style="width:${(1-missing)*100}%"></div></div><div class="progress-label">完整率 ${pct(1-missing)}</div></td><td><span class="badge ${v.available === false ? "gray" : "green"}">${v.available === false ? "不可派生" : "确定性规则"}</span></td><td><span class="badge ${available ? "green" : "red"}">${status}</span></td></tr>`;
    }).join("");
    return `
      <section class="grid grid-4">
        ${metric("研究所需变量", config.variableDictionary.length, "由研究定义自动生成", "≡")}
        ${metric("关键必需变量", config.variableDictionary.filter(v => v.required).length, "决定能否进入分析队列", "!")}
        ${metric("当前缺失变量", config.variableDictionary.filter(v => v.available === false).length, "明确标记，不使用原Demo模拟值", "✦")}
        ${metric("当前可分析患者", cohort.final.length, "索引、暴露和观察窗口均可判定", "◉")}
      </section>
      <section class="card section-gap">
        <div class="card-header"><div><h3>研究变量就绪度</h3><p>这张表回答：现有业务数据距离研究所需数据还差什么。</p></div><button class="secondary-button small-button" id="export-map">导出变量映射</button></div>
        <div class="alert amber"><strong>!</strong><div><b>数据边界：</b>当前只有单一模拟住院数据源。页面中的“未再入院”准确含义是“当前数据源内30天未记录再入院”，不能推断患者没有外院住院。</div></div>
        <div class="table-wrap section-gap"><table><thead><tr><th>标准研究变量</th><th>用途</th><th>原始来源</th><th>数据完整性</th><th>转换方式</th><th>状态</th></tr></thead><tbody>${rows}</tbody></table></div>
      </section>`;
  }

  function renderCohort() {
    const cohort = deriveCohort();
    const widths = cohort.stages.map((_, i) => 100 - i * 8);
    return `
      <section class="grid grid-2">
        <div class="card">
          <div class="card-header"><div><h3>患者筛选漏斗</h3><p>每一步都可解释、可复现，并能回看被排除患者。</p></div><span class="badge green">规则已执行</span></div>
          <div class="funnel">${cohort.stages.map((stage, i) => `${i ? `<div class="funnel-drop">排除 ${cohort.stages[i-1].patients.length-stage.patients.length} 人</div>` : ""}<div class="funnel-step" data-stage="${i}" style="width:${widths[i]}%"><span>${stage.label}</span><strong>${stage.patients.length}</strong></div>`).join("")}</div>
        </div>
        <div>
          <div class="grid grid-2">
            <div class="group-card treatment"><span class="badge green">暴露组</span><div class="big">${cohort.treatment.length}</div><strong>Tiotropium</strong><p class="muted">索引住院期间吸入处方</p></div>
            <div class="group-card control"><span class="badge blue">对照组</span><div class="big">${cohort.control.length}</div><strong>其他标准治疗</strong><p class="muted">未使用Tiotropium</p></div>
          </div>
          <div class="card section-gap">
            <div class="card-header"><div><h3>可执行队列规则</h3><p>换研究问题时修改配置，而不是重新开发页面。</p></div></div>
            <div class="raw-text mono">age_at_admission &gt;= 50<br>AND primary_icd9 IN (49122, 49322, 496)<br>AND hospital_expire_flag == 0<br>AND admission_type != "ELECTIVE"<br>AND prescription_records &gt; 0<br>AND observation_days &gt;= 30<br>INDEX = first_eligible_admission</div>
            <div class="section-gap"><button class="primary-button" data-go="quality">检查两组可比性</button></div>
          </div>
        </div>
      </section>`;
  }

  function balanceData() {
    const { treatment, control } = deriveCohort();
    const tAge = treatment.map(p => p.age); const cAge = control.map(p => p.age);
    const tPrior = treatment.map(p => p.priorAdmissions); const cPrior = control.map(p => p.priorAdmissions);
    const tComorbidity = treatment.map(p => p.comorbidityCount); const cComorbidity = control.map(p => p.comorbidityCount);
    return [
      { label: "年龄", t: mean(tAge), c: mean(cAge), tDisplay: meanSd(tAge, "岁"), cDisplay: meanSd(cAge, "岁"), summary: "均值 ± SD", smd: smdNumeric(tAge, cAge) },
      { label: "女性", t: treatment.filter(p => p.sex === "女").length / treatment.length, c: control.filter(p => p.sex === "女").length / control.length, tDisplay: countPercent(treatment, p => p.sex === "女"), cDisplay: countPercent(control, p => p.sex === "女"), summary: "n（%）", smd: smdBinary(treatment.map(p => p.sex === "女"), control.map(p => p.sex === "女")) },
      { label: "既往住院次数", t: mean(tPrior), c: mean(cPrior), tDisplay: medianIqr(tPrior, "次"), cDisplay: medianIqr(cPrior, "次"), summary: "中位数 [IQR]", smd: smdNumeric(tPrior, cPrior) },
      { label: "索引住院进入ICU", t: treatment.filter(p => p.icu).length / treatment.length, c: control.filter(p => p.icu).length / control.length, tDisplay: countPercent(treatment, p => p.icu), cDisplay: countPercent(control, p => p.icu), summary: "n（%）· 时间顺序待确认", smd: smdBinary(treatment.map(p => p.icu), control.map(p => p.icu)) },
      { label: "合并诊断数量", t: mean(tComorbidity), c: mean(cComorbidity), tDisplay: medianIqr(tComorbidity, "个"), cDisplay: medianIqr(cComorbidity, "个"), summary: "中位数 [IQR] · 时间顺序待确认", smd: smdNumeric(tComorbidity, cComorbidity) }
    ];
  }

  function renderQuality() {
    const rows = balanceData();
    const maxSmd = Math.max(...rows.map(r => r.smd));
    const statusLabel = state.governanceConfirmed ? "已确认" : "待确认";
    return `
      <section class="grid grid-3">
        ${metric("核心派生字段完整率", pct(deriveCohort().final.length / patients.length), "181/200可形成研究就绪记录", "✓")}
        ${metric("最大标准化差异", maxSmd.toFixed(2), "SMD>0.10触发调整警告，不代表已消除混杂", "↔")}
        ${metric("治理规则状态", statusLabel, state.governanceConfirmed ? "数据口径已由人工确认" : "需临床、数据与统计角色共同确认", "◎")}
      </section>
      <section class="card section-gap">
        <div class="card-header"><div><h3>数据来源覆盖</h3><p>平台区分“已经接入”与“研究需要但尚未接入”，不使用虚构数据补齐缺口。</p></div><span class="badge ${state.governanceConfirmed ? "green" : "amber"}">${statusLabel}</span></div>
        <div class="source-grid">${config.dataSources.map(source => `<article class="source-card ${source.status === "已接入" ? "connected" : "pending"}"><div><strong>${source.name}</strong><span class="source-status">${source.status}</span></div><p>${source.detail}</p><small>研究影响：${source.impact}</small></article>`).join("")}</div>
      </section>
      <section class="grid grid-2 section-gap">
        <div class="card">
          <div class="card-header"><div><h3>治疗组与对照组基线</h3><p>调整前差异用于触发方法讨论，不能由系统自动解释为“混杂已经解决”。</p></div></div>
          ${rows.map(r => `<div class="balance-row"><div><strong>${r.label}</strong><small class="table-note">${r.summary}</small><div class="muted">治疗 ${r.tDisplay} · 对照 ${r.cDisplay}</div></div><div class="balance-bar"><span style="width:${Math.min(100,r.smd*220)}%;background:${r.smd>.1 ? '#c7821c' : '#087f79'}"></span></div><div class="balance-value" style="color:${r.smd>.1 ? '#b66a05' : '#21845a'}">SMD ${r.smd.toFixed(2)}</div></div>`).join("")}
          <div class="alert green section-gap"><strong>✓</strong><div><b>表1描述口径已规范：</b>连续变量根据分布报告均值±SD或中位数[IQR]，分类变量报告n（%）；组间可比性主要查看SMD。t检验、秩和检验、卡方或Fisher可作为按需的未调整探索，但不用于宣告基线“相同”，也不能代替混杂调整。</div></div>
        </div>
        <div class="grid">
          <div class="alert amber"><strong>i</strong><div><b>死亡字段不是简单冲突：</b>PATIENTS.expire_flag是患者级死亡状态，ADMISSIONS.hospital_expire_flag是某次住院的院内死亡状态，统计对象和时间口径不同。本研究“存活出院”使用索引住院字段。</div></div>
          <div class="alert amber"><strong>!</strong><div><b>结局覆盖限制：</b>未连接区域平台、医保或外院数据，因此“当前数据源未记录再入院”不等于患者真实未再入院。</div></div>
          <div class="alert amber"><strong>!</strong><div><b>关键混杂缺失：</b>GOLD、CAT、吸烟、肺功能与依从性未提供。回归、加权和匹配均不能消除未测量混杂。</div></div>
          <div class="card"><h3>自动与人工的边界</h3><ul class="list-clean section-gap"><li class="check">程序自动计算完整性、来源覆盖和SMD</li><li class="check">Agent整理问题、建议规则与影响</li><li class="cross">临床专家确认临床语义</li><li class="cross">数据管理员确认字段和派生口径</li><li class="cross">统计师确认分析影响和处理方式</li></ul></div>
        </div>
      </section>
      <section class="card section-gap">
        <div class="card-header"><div><h3>数据治理决策清单</h3><p>每一项都保留发现、规则、审核角色和确认状态，便于在报告中审计。</p></div></div>
        <div class="governance-list">${config.governanceIssues.map(issue => `<article class="governance-item"><div class="governance-title"><div><strong>${issue.title}</strong><span class="mono">${issue.fields}</span></div><span class="badge ${state.governanceConfirmed ? "green" : "amber"}">${statusLabel}</span></div><p><b>发现：</b>${issue.finding}</p><p><b>采用规则：</b>${issue.rule}</p><small>审核角色：${issue.reviewer}</small></article>`).join("")}</div>
        <div class="report-actions"><button id="confirm-governance" class="${state.governanceConfirmed ? "secondary-button" : "primary-button"}">${state.governanceConfirmed ? "治理规则已确认，进入分析方案" : "人工确认数据治理规则"}</button></div>
      </section>`;
  }

  function renderAnalysisPlan() {
    const rows = balanceData();
    const maxSmd = Math.max(...rows.map(row => row.smd));
    const cohort = deriveCohort();
    const iptw = stats.analyze(cohort.final, "iptw", { propensityBounds: [0.05, 0.95] });
    return `
      <section class="grid grid-3">
        ${metric("调整前最大SMD", maxSmd.toFixed(2), "高于0.10，提示两组基线不可直接视为可比", "!")}
        ${metric("建议主分析", "IPTW", "目标为完整研究队列ATE", "A")}
        ${metric("预检后最大SMD", iptw.diagnosticValue, `ESS ${Number(iptw.sampleValue).toFixed(1)} / 原始${cohort.final.length}人`, "✓")}
      </section>
      <section class="grid grid-2 section-gap">
        <div class="recommendation-card">
          <span class="badge green">规则推荐</span><h2>以IPTW作为主分析</h2><p>${config.analysisPlan.trigger}${config.analysisPlan.recommendation}</p>
          <div class="alert amber"><strong>!</strong><div>${config.analysisPlan.caution}</div></div>
        </div>
        <div class="card"><div class="card-header"><div><h3>为什么不能只报粗分析</h3><p>暴露不是随机分配，粗风险差同时包含治疗差异和基线差异。</p></div></div><ul class="list-clean"><li class="check">先明确估计目标：完整队列ATE</li><li class="check">使用现有基线变量估计倾向评分</li><li class="check">检查重叠、权重、有效样本量和调整后SMD</li><li class="cross">仍需保留未测量混杂与单源结局限制</li></ul></div>
      </section>
      <section class="card section-gap">
        <div class="card-header"><div><h3>预设统计方法及其角色</h3><p>不同方法不是互相竞争的四个答案，而是在同一分析计划中承担不同任务。</p></div><span class="badge ${state.analysisPlanConfirmed ? "green" : "amber"}">${state.analysisPlanConfirmed ? "统计师已确认" : "等待统计师确认"}</span></div>
        <div class="method-grid">${config.analysisMethods.map(method => `<article class="method-card ${method.id === "iptw" ? "recommended" : ""}"><span class="method-role">${method.role}</span><h3>${method.label}</h3><p>${method.scope}</p></article>`).join("")}</div>
      </section>
      <section class="card section-gap">
        <div class="card-header"><div><h3>按研究问题选择统计方法</h3><p>先看结局类型、研究目的和数据条件，再决定方法；不能只因为软件里有按钮就执行。</p></div><span class="badge blue">方法导航</span></div>
        <div class="table-wrap section-gap"><table class="method-guide-table"><thead><tr><th>研究问题</th><th>建议方法</th><th>应报告什么</th><th>本Demo状态</th></tr></thead><tbody>${config.methodGuide.map(item => `<tr><td><strong>${item.question}</strong><small class="table-note">${item.note}</small></td><td>${item.method}</td><td>${item.output}</td><td><span class="badge ${item.tone}">${item.status}</span></td></tr>`).join("")}</tbody></table></div>
      </section>
      <section class="grid grid-2 section-gap">
        <div class="card"><div class="card-header"><div><h3>倾向评分变量怎么选</h3><p>不是把所有字段机械放进Logistic模型。</p></div></div><ul class="list-clean"><li class="check"><strong>优先纳入：</strong>暴露前已经存在、同时影响治疗选择和结局的混杂因素，以及重要结局预测因子。</li><li class="cross"><strong>不要纳入：</strong>暴露之后才发生的中介变量、由暴露和结局共同影响的碰撞变量。</li><li class="cross"><strong>谨慎纳入：</strong>只强烈预测治疗、却与结局无关的工具变量；可能增加权重波动而不减少混杂。</li><li><strong>选择原则：</strong>结合临床知识、时间顺序与因果图预先指定，不按单变量P值筛选。</li></ul></div>
        <div class="card"><div class="card-header"><div><h3>当前协变量审核</h3><p>区分“可以直接使用”和“正式研究前需确认”。</p></div></div><ul class="list-clean"><li class="check"><strong>年龄、性别、既往365天住院：</strong>明确发生在暴露前，可作为现有基线变量。</li><li class="cross"><strong>索引住院ICU、合并诊断数量：</strong>当前作为疾病严重度代理，但需核对它们是否早于首次Tiotropium处方。</li><li class="cross"><strong>GOLD、CAT、吸烟、肺功能：</strong>临床重要但当前数据缺失，不能由模型自动补齐。</li><li><strong>当前处理：</strong>保留现有结果用于Demo复算，同时把时间顺序设为统计师确认门槛；没有证据时不擅自删变量或改结果。</li></ul></div>
      </section>
      <section class="card section-gap">
        <div class="card-header"><div><h3>执行前确认项</h3><p>满足这些条件后，方法推荐才可转为正式分析方案。</p></div></div>
        <ul class="list-clean">${config.analysisPlan.prerequisites.map(item => `<li class="${state.analysisPlanConfirmed ? "check" : "cross"}">${item}</li>`).join("")}</ul>
        <div class="report-actions"><button id="confirm-analysis-plan" class="${state.analysisPlanConfirmed ? "secondary-button" : "primary-button"}">${state.analysisPlanConfirmed ? "分析方案已确认，查看效应估计" : "统计师确认分析方案"}</button></div>
      </section>`;
  }

  function renderAnalysis() {
    const a = deriveAnalysis();
    const selectedMethod = config.analysisMethods.find((method) => method.id === state.analysisMethod);
    const interval = a.effectCi ? `${a.effectCi[0].toFixed(2)}—${a.effectCi[1].toFixed(2)}` : "当前未估计";
    const resultDirection = a.riskDifference < 0 ? "Tiotropium组观察风险较低" : "Tiotropium组观察风险未降低";
    const before = balanceData();
    const after = a.balance || [];
    const propensity = a.propensitySummary;
    const diagnostics = state.analysisMethod === "iptw" ? `
      <div class="diagnostic-grid">
        <div class="diagnostic-card"><span>倾向评分范围 · 暴露组</span><strong>${propensity.treatment.min.toFixed(2)}—${propensity.treatment.max.toFixed(2)}</strong><small>中位数 ${propensity.treatment.median.toFixed(2)}</small></div>
        <div class="diagnostic-card"><span>倾向评分范围 · 对照组</span><strong>${propensity.control.min.toFixed(2)}—${propensity.control.max.toFixed(2)}</strong><small>中位数 ${propensity.control.median.toFixed(2)}</small></div>
        <div class="diagnostic-card"><span>稳定化权重</span><strong>${a.weightSummary.min.toFixed(2)}—${a.weightSummary.max.toFixed(2)}</strong><small>中位数 ${a.weightSummary.median.toFixed(2)}；>10共${a.weightSummary.above10}人</small></div>
        <div class="diagnostic-card"><span>有效样本量 ESS</span><strong>${Number(a.sampleValue).toFixed(1)}</strong><small>原始队列 ${deriveCohort().final.length} 人</small></div>
      </div>` : state.analysisMethod === "matching" ? `
      <div class="diagnostic-grid">
        <div class="diagnostic-card"><span>成功匹配</span><strong>${a.sampleValue}</strong><small>无放回1:1近邻匹配</small></div>
        <div class="diagnostic-card"><span>未匹配暴露患者</span><strong>${a.unmatchedTreatment}</strong><small>不进入匹配后效应估计</small></div>
        <div class="diagnostic-card"><span>未匹配对照患者</span><strong>${a.unmatchedControl}</strong><small>不进入匹配后效应估计</small></div>
        <div class="diagnostic-card"><span>匹配后最大SMD</span><strong>${a.diagnosticValue}</strong><small>结果适用于成功匹配人群</small></div>
      </div>` : "";
    const balanceComparison = after.length ? `<section class="card section-gap"><div class="card-header"><div><h3>调整前后平衡诊断</h3><p>SMD越接近0，两组在已测量变量上越相似；这不代表未测量混杂消失。</p></div></div>${before.map((row,index) => { const adjusted = after[index]?.smd ?? row.smd; return `<div class="smd-row"><strong>${row.label}</strong><div class="smd-bars"><span class="before" style="width:${Math.min(100,row.smd*260)}%"></span><span class="after" style="width:${Math.min(100,adjusted*260)}%"></span></div><small>${row.smd.toFixed(2)} → ${adjusted.toFixed(2)}</small></div>`; }).join("")}<div class="smd-legend"><span><i class="before"></i>调整前</span><span><i class="after"></i>调整后</span></div></section>` : "";
    return `
      ${!state.analysisPlanConfirmed ? '<div class="alert amber"><strong>!</strong><div><b>分析方案尚未确认：</b>当前页面允许预览结果，但正式报告前应由统计师确认估计目标、混杂变量、诊断与区间估计方法。</div></div>' : ''}
      <section class="card ${!state.analysisPlanConfirmed ? "section-gap" : ""}">
        <div class="card-header"><div><h3>执行统计分析</h3><p>分析方案建议IPTW为主分析；方法切换用于查看描述性参照、支持性与敏感性结果。</p></div><span class="badge blue">确定性统计模块</span></div>
        <div class="filters section-gap"><select id="analysis-method" class="select">${config.analysisMethods.map((method) => `<option value="${method.id}" ${state.analysisMethod === method.id ? "selected" : ""}>${method.label} · ${method.role}</option>`).join("")}</select><div class="raw-text"><strong>${selectedMethod.role}：</strong>${selectedMethod.scope}</div></div>
        <div class="alert amber section-gap"><strong>!</strong><div><b>调整边界：</b>当前模型使用年龄、性别、既往住院、ICU入住和合并诊断数量；其中ICU与合并诊断必须在正式研究前核对是否发生于首次用药之前。GOLD、CAT、吸烟和肺功能缺失，任何方法都不能自动补救未测量混杂。</div></div>
      </section>
      <section class="result-hero"><div class="result-group"><span>${a.tLabel}</span><div class="result-rate">${pct(a.tRate)}</div><div class="result-bar"><i style="width:${a.tRate*300}%"></i></div></div><div class="result-group"><span>${a.cLabel}</span><div class="result-rate">${pct(a.cRate)}</div><div class="result-bar"><i style="width:${a.cRate*300}%;background:#84a8da"></i></div></div></section>
      <section class="grid grid-4 section-gap">
        ${metric("风险差", `${(a.riskDifference*100).toFixed(1)}个百分点`, `${a.label}下的Tiotropium风险减去对照风险`, "Δ")}
        ${metric(a.effectLabel, a.effectValue.toFixed(2), a.effectValue < 1 ? "观察到较低的相对效应" : "未观察到较低的相对效应", "E")}
        ${metric("效应量95%区间", interval, a.effectCi ? "区间跨1表示不能排除无差异" : a.id === "matching" ? "正式估计需考虑配对结构" : "正式估计需使用稳健标准误或Bootstrap", "CI")}
        ${metric(a.sampleLabel, a.sampleValue, a.id === "matching" ? "匹配成功的患者对数" : a.id === "iptw" ? "权重折算后的信息量" : "进入当前模型的患者", "n")}
      </section>
      ${diagnostics ? `<section class="card section-gap"><div class="card-header"><div><h3>关键诊断</h3><p>效应数字之外，同时检查模型是否具备基本可解释条件。</p></div></div>${diagnostics}</section>` : ''}
      ${balanceComparison}
      <section class="grid grid-2 section-gap"><div class="analysis-callout"><span class="badge amber">探索性关联</span><h3>${a.label}结果</h3><strong>${resultDirection}</strong><p>当前方法下两组风险分别为 ${pct(a.tRate)} 和 ${pct(a.cRate)}，风险差为 ${(a.riskDifference*100).toFixed(1)} 个百分点，${a.effectLabel}为 ${a.effectValue.toFixed(2)}。这仍是当前虚拟数据中的探索性关联，不代表药物造成了这一差异。</p><button class="primary-button" data-go="sensitivity">继续做敏感性分析</button></div><div class="card"><div class="card-header"><div><h3>方法说明</h3><p>方法、调整变量和诊断信息随选择动态变化。</p></div><span class="badge green">可复算</span></div><ul class="list-clean"><li><strong>当前角色：</strong>${selectedMethod.role}</li><li><strong>调整方式：</strong>${a.adjustment}</li><li><strong>${a.diagnosticLabel}：</strong>${a.diagnosticValue ?? "未调整"}</li><li><strong>适用说明：</strong>${a.note}</li><li><strong>共同限制：</strong>关键临床严重度变量缺失，单一数据源可能漏掉外院再入院。</li></ul></div></section>`;
  }

  function deriveSensitivityRows() {
    const base = deriveCohort().final;
    const makeOutcome = (windowDays, excludeElective = false) => base.map(patient => ({ ...patient, readmitted30d: patient.readmissionGapDays > 0 && patient.readmissionGapDays <= windowDays && (!excludeElective || patient.readmissionType !== "ELECTIVE") }));
    const scenarios = [
      { label: "主要设定", detail: "30天结局；PS截断0.05—0.95", patients: makeOutcome(30), method: "iptw", options: { propensityBounds: [0.05, 0.95] } },
      { label: "较短结局窗口", detail: "14天当前数据源全因再入院", patients: makeOutcome(14), method: "iptw", options: { propensityBounds: [0.05, 0.95] } },
      { label: "排除计划再入院", detail: "30天结局；排除ELECTIVE再入院", patients: makeOutcome(30, true), method: "iptw", options: { propensityBounds: [0.05, 0.95] } },
      { label: "倾向评分截断替代", detail: "30天结局；PS截断0.01—0.99", patients: makeOutcome(30), method: "iptw", options: { propensityBounds: [0.01, 0.99] } },
      { label: "未调整参照", detail: "原始30天粗分析", patients: makeOutcome(30), method: "crude", options: {} }
    ];
    return scenarios.map(scenario => ({ ...scenario, result: stats.analyze(scenario.patients, scenario.method, scenario.options) }));
  }

  function renderSensitivity() {
    const rows = deriveSensitivityRows();
    const crude = stats.analyze(deriveCohort().final, "crude");
    const evalue = stats.eValue(crude.effectValue, crude.effectCi);
    return `
      <section class="card"><div class="card-header"><div><h3>替代分析设定</h3><p>敏感性分析不是为了寻找“更显著”的结果，而是检查结论是否依赖某一个人为设定。</p></div><span class="badge blue">预设场景</span></div><div class="table-wrap section-gap"><table><thead><tr><th>场景</th><th>暴露风险</th><th>对照风险</th><th>风险差</th><th>RR</th><th>诊断</th></tr></thead><tbody>${rows.map(row => { const r=row.result; return `<tr><td><strong>${row.label}</strong><small class="table-note">${row.detail}</small></td><td>${pct(r.tRate)}</td><td>${pct(r.cRate)}</td><td>${(r.riskDifference*100).toFixed(1)}个百分点</td><td>${r.effectValue.toFixed(2)}</td><td>${r.id === "iptw" ? `最大SMD ${r.diagnosticValue}；ESS ${Number(r.sampleValue).toFixed(1)}` : "未调整"}</td></tr>`; }).join("")}</tbody></table></div></section>
      <section class="grid grid-2 section-gap"><div class="card"><div class="card-header"><div><h3>未测量混杂：E-value提示</h3><p>用于量化“一个未测量混杂因素需要多强，才可能解释掉当前点估计”。</p></div></div><div class="diagnostic-grid"><div class="diagnostic-card"><span>粗RR点估计E-value</span><strong>${evalue.point.toFixed(2)}</strong><small>仅作为敏感性量化提示</small></div><div class="diagnostic-card"><span>置信区间对应E-value</span><strong>${evalue.ci.toFixed(2)}</strong><small>粗RR区间跨1，因此为1.00</small></div></div><div class="alert amber section-gap"><strong>!</strong><div>点估计看似需要较强混杂才能完全解释，但置信区间已经包含无差异，所以现有样本仍不能排除“没有真实差异”。</div></div></div><div class="card"><div class="card-header"><div><h3>方法就绪度</h3><p>只在数据和研究定义满足条件时启用扩展方法。</p></div></div><ul class="list-clean"><li class="check"><strong>窗口与结局定义：</strong>已展示14天、30天及排除计划再入院。</li><li class="check"><strong>PS设定：</strong>已比较两种截断规则。</li><li class="cross"><strong>Cox/KM：</strong>需先明确时间结局、删失规则和随访来源，不盲目套用于固定30天二分类主终点。</li><li class="cross"><strong>负对照：</strong>当前虚拟数据没有临床合理的负对照暴露或结局，因此不执行、不伪造。</li></ul></div></section>
      <section class="card section-gap"><div class="card-header"><div><h3>稳健性判断</h3><p>结果并非对所有设定都稳定：30天分析方向相近，但14天窗口的方向发生反转。</p></div></div><div class="alert amber"><strong>!</strong><div><b>可报告：</b>30天主要设定、排除计划再入院和倾向评分截断替代分析均观察到Tiotropium组风险较低；但14天分析RR约为1.11，提示结论依赖结局时间窗，应作为不确定性而不是“稳健证据”报告。</div></div><div class="alert red section-gap"><strong>!</strong><div><b>不可报告：</b>不能声称药物稳定降低再入院；正式研究还需要预设窗口、补充严重度和外院结局，并完成区间估计。</div></div><div class="report-actions"><button class="primary-button" data-go="evidence">生成完整研究报告</button></div></section>`;
  }

  function reportMarkdown() {
    const a = stats.analyze(deriveCohort().final, "iptw", { propensityBounds: [0.05, 0.95] });
    const rows = deriveSensitivityRows();
    return `# ${config.study.title}

> 证据等级：探索性；需临床与统计复核。

## 研究目的

${config.study.objective}

## 研究设计

${config.study.design}。主要终点：${config.study.primaryEndpoint}。

## 数据来源与治理

当前仅接入住院EMR虚拟数据。外院结局、GOLD、CAT、吸烟、肺功能和依从性未接入。死亡字段按住院级与患者级不同语义分别使用。

## 分析方案

建议主分析为IPTW（ATE口径），粗分析为描述性参照，多变量Logistic为支持性分析，1:1 PSM为敏感性分析。描述性表1按变量分布报告均值±SD、中位数[IQR]或n（%），组间平衡以SMD为主，不按P值筛选混杂因素。当前ICU入住和合并诊断数量仅作为候选严重度代理，正式研究需确认其发生早于首次用药。

## 主要结果

最终队列${deriveCohort().final.length}人。IPTW下Tiotropium组与对照组30天风险分别为${pct(a.tRate)}和${pct(a.cRate)}，风险差${(a.riskDifference*100).toFixed(1)}个百分点，RR ${a.effectValue.toFixed(2)}；ESS ${Number(a.sampleValue).toFixed(1)}，加权后最大SMD ${a.diagnosticValue}。IPTW当前为点估计，正式区间需稳健标准误或Bootstrap。

## 敏感性分析

${rows.map(row => `- ${row.label}：暴露${pct(row.result.tRate)}，对照${pct(row.result.cRate)}，RD ${(row.result.riskDifference*100).toFixed(1)}个百分点，RR ${row.result.effectValue.toFixed(2)}。`).join("\n")}

## 限制与结论边界

结果只表示当前虚拟数据中的探索性关联。30天设定观察到较低风险，但14天窗口方向反转，提示结果依赖终点时间窗。治疗非随机分配，关键未测量混杂与外院结局缺失仍然存在；不能据此证明因果效果，也不能用于临床决策、监管申报或宣传。

## 人工确认状态

- 研究方案：${state.studyConfirmed ? "已确认" : "待确认"}
- 数据治理：${state.governanceConfirmed ? "已确认" : "待确认"}
- 分析方案：${state.analysisPlanConfirmed ? "已确认" : "待确认"}
`;
  }

  function renderEvidence() {
    const a = stats.analyze(deriveCohort().final, "iptw", { propensityBounds: [0.05, 0.95] });
    const rows = deriveSensitivityRows();
    return `
      <div class="report-actions no-print"><button id="print-report" class="primary-button">打印 / 保存PDF</button><button id="download-report" class="secondary-button">下载Markdown报告</button></div>
      <section class="evidence-paper">
        <span class="eyebrow">EXPLORATORY RESEARCH REPORT</span><h2>${config.study.title}</h2><span class="confidence">证据可信度：探索性 / 需要人工与统计复核</span>
        <div class="status-rail"><span class="${state.studyConfirmed ? "done" : "pending"}">研究方案 ${state.studyConfirmed ? "已确认" : "待确认"}</span><span class="${state.governanceConfirmed ? "done" : "pending"}">数据治理 ${state.governanceConfirmed ? "已确认" : "待确认"}</span><span class="${state.analysisPlanConfirmed ? "done" : "pending"}">分析方案 ${state.analysisPlanConfirmed ? "已确认" : "待确认"}</span></div>
        <div class="evidence-section"><h4>1. 研究背景与目的</h4><p>${config.study.objective}</p></div>
        <div class="evidence-section"><h4>2. 研究设计与估计目标</h4><p>${config.study.design}。研究人群为${config.study.population}；估计目标为：${config.study.estimand}</p></div>
        <div class="evidence-section"><h4>3. 终点定义</h4><p><b>主要终点：</b>${config.study.primaryEndpoint}。<br><b>次要终点：</b>${config.study.secondaryEndpoints.join("；")}。<br><b>当前不支持：</b>${config.study.unsupportedEndpoints}。</p></div>
        <div class="evidence-section"><h4>4. 数据来源与治理决策</h4><p>当前仅接入卜彦斌提供的AECOPD虚拟住院CSV。院外再入院和疾病严重度信息未接入；“未记录再入院”不能解释为真实未再入院。PATIENTS.expire_flag与ADMISSIONS.hospital_expire_flag分别表示患者级死亡状态和住院级院内死亡，本研究存活出院使用索引住院字段。</p></div>
        <div class="evidence-section"><h4>5. 队列筛选</h4><p>从200名患者中，依次应用年龄与主要诊断、首次合格非择期存活出院、有处方、30天观察完整和暴露可判定规则，形成181人最终队列；Tiotropium组93人，对照组88人。</p></div>
        <div class="evidence-section"><h4>6. 分析方案</h4><p>以IPTW作为建议主分析，估计完整队列ATE；粗分析为描述性参照，多变量Logistic为支持性分析，1:1倾向评分匹配为敏感性分析。表1按分布报告均值±SD、中位数[IQR]或n（%），平衡诊断以SMD为主，不按P值筛选变量。现有模型使用年龄、性别、既往住院、ICU入住和合并诊断数量；其中ICU与合并诊断为候选严重度代理，正式研究需核对其是否早于首次用药，避免纳入暴露后信息。</p></div>
        <div class="evidence-section"><h4>7. 主要结果</h4><p>IPTW下Tiotropium组和对照组30天风险分别为${pct(a.tRate)}和${pct(a.cRate)}，风险差为${(a.riskDifference*100).toFixed(1)}个百分点，RR为${a.effectValue.toFixed(2)}；有效样本量为${Number(a.sampleValue).toFixed(1)}，加权后最大SMD为${a.diagnosticValue}。当前IPTW展示点估计，正式推断仍需稳健标准误或Bootstrap区间。</p></div>
        <div class="evidence-section"><h4>8. 敏感性分析</h4><div class="report-table"><table><thead><tr><th>场景</th><th>风险差</th><th>RR</th></tr></thead><tbody>${rows.map(row => `<tr><td>${row.label}</td><td>${(row.result.riskDifference*100).toFixed(1)}个百分点</td><td>${row.result.effectValue.toFixed(2)}</td></tr>`).join("")}</tbody></table></div></div>
        <div class="evidence-section"><h4>9. 局限性</h4><p>治疗非随机分配，GOLD、CAT、吸烟、肺功能和依从性等关键临床变量缺失；单一住院源可能漏掉外院再入院；样本量与事件数有限。统计调整只能处理已测量混杂。</p></div>
        <div class="evidence-section"><h4>10. 可以与不能得出的结论</h4><p><b>可以：</b>在当前虚拟数据中，30天主要与替代分析观察到Tiotropium组较低风险，但14天结果方向反转。这一不一致可用于提示团队预先明确临床时间窗并补充数据。<br><b>不能：</b>不能证明Tiotropium造成再入院风险降低，也不能把结果表述为对所有设定均稳健；不能用于临床决策、监管申报或药品宣传。</p></div>
        <div class="evidence-section"><h4>11. 审计与下一步</h4><p>变量保留原始字段、转换规则和患者级溯源；研究方案、数据治理与分析方案分别设置人工确认点。下一步需补充跨院结局与疾病严重度变量，核对候选混杂变量相对首次用药的时间顺序，并由统计师复核代码、区间估计和报告。Cox/KM仅在时间零点、删失、竞争风险与比例风险假设均可说明时启用。</p><div class="section-gap no-print"><button class="secondary-button" data-go="variables">查看变量溯源</button> <button class="ghost-button" data-go="cases">查看患者病例</button></div></div>
      </section>`;
  }

  function renderBoundary() {
    return `
      <section class="architecture">
        <div class="architecture-card"><span>01 · 通用底座</span><h3>通用研究引擎</h3><p>研究定义、变量映射、队列筛选、质量检查、统计工具与证据溯源。不同疾病共同复用，不为每个研究问题重做系统。</p></div>
        <div class="architecture-card"><span>02 · 临床语义</span><h3>疾病数据包</h3><p>COPD数据包包含GOLD、CAT/mMRC、急性加重、吸入治疗与围出院管理等专科概念。换成白血病时新增数据包，而非重建平台。</p></div>
        <div class="architecture-card"><span>03 · 研究配置</span><h3>研究问题模板</h3><p>再入院率、疗效、安全性、AE/SAE和依从性分别配置人群、暴露、结局、时间窗口与分析规则。</p></div>
      </section>
      <section class="grid grid-3 section-gap">
        <div class="card"><div class="card-header"><div><h3>Agent可以自动完成</h3><p>提高重复工作的效率与一致性。</p></div></div><ul class="list-clean">${["初步拆解研究问题", "推荐并映射研究变量", "执行确定性队列规则", "发现缺失与组间差异", "调用统计代码计算结果", "生成带限制条件的摘要初稿"].map(x => `<li class="check">${x}</li>`).join("")}</ul></div>
        <div class="card"><div class="card-header"><div><h3>必须人工确认</h3><p>涉及医学判断、因果假设和正式结论。</p></div></div><ul class="list-clean">${["最终研究设计和入排标准", "临床变量与结局定义", "混杂因素是否充分", "对照组是否合理", "统计方法与敏感性分析", "伦理合规和正式报告签署"].map(x => `<li class="cross">${x}</li>`).join("")}</ul></div>
        <div class="card"><div class="card-header"><div><h3>当前版本不承诺</h3><p>明确产品边界比夸大AI能力更重要。</p></div></div><ul class="list-clean">${["自动生成注册级证据", "自动证明药物因果效果", "替代医生和统计师", "零配置适配所有疾病", "单院数据识别全部外院结局", "将探索性结果用于临床决策"].map(x => `<li class="cross">${x}</li>`).join("")}</ul></div>
      </section>
      <section class="card section-gap"><div class="card-header"><div><h3>这个产品真正卖什么</h3><p>不是“一个会回答问题的大模型”，而是一套把业务数据转成研究就绪资产的可复用工作流。</p></div></div><div class="flow">${["减少重复取数", "缩短可行性评估", "复用疾病数据模型", "统一队列口径", "保留证据溯源", "人机协同交付"].map((x,i) => `<div class="flow-step"><span>VALUE ${i+1}</span><strong>${x}</strong></div>`).join("")}</div></section>`;
  }

  const renderers = { overview: renderOverview, cases: renderCases, question: renderQuestion, variables: renderVariables, cohort: renderCohort, quality: renderQuality, analysisPlan: renderAnalysisPlan, analysis: renderAnalysis, sensitivity: renderSensitivity, evidence: renderEvidence, boundary: renderBoundary };

  function render() {
    renderNav();
    pageHeader(config.navigation.find((x) => x.id === state.page));
    root.innerHTML = (renderers[state.page] || renderOverview)();
    bindPageEvents();
  }

  function bindPageEvents() {
    root.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => go(btn.dataset.go)));
    root.querySelectorAll("[data-patient]").forEach(btn => btn.addEventListener("click", () => openPatient(btn.dataset.patient)));
    root.querySelectorAll("[data-variable]").forEach(btn => btn.addEventListener("click", () => openVariable(btn.dataset.variable)));
    root.querySelectorAll("[data-stage]").forEach(btn => btn.addEventListener("click", () => openStage(Number(btn.dataset.stage))));
    root.querySelectorAll("[data-preview]").forEach(btn => btn.addEventListener("click", () => showToast(`${btn.dataset.preview} 模板将在下一版本配置`)));
    const search = document.getElementById("case-search");
    if (search) search.addEventListener("input", (e) => { state.caseSearch = e.target.value; render(); const next = document.getElementById("case-search"); next?.focus(); next?.setSelectionRange(state.caseSearch.length, state.caseSearch.length); });
    const diag = document.getElementById("diagnosis-filter");
    if (diag) diag.addEventListener("change", (e) => { state.diagnosisFilter = e.target.value; render(); });
    const treatment = document.getElementById("treatment-filter");
    if (treatment) treatment.addEventListener("change", (e) => { state.treatmentFilter = e.target.value; render(); });
    const analysisMethod = document.getElementById("analysis-method");
    if (analysisMethod) analysisMethod.addEventListener("change", (e) => { state.analysisMethod = e.target.value; saveState(); render(); });
    const question = document.getElementById("research-question");
    if (question) question.addEventListener("change", (e) => { state.question = e.target.value; saveState(); });
    document.getElementById("run-agents")?.addEventListener("click", runAgents);
    document.getElementById("confirm-study")?.addEventListener("click", () => { state.studyConfirmed = true; state.workflowStep = Math.max(state.workflowStep, config.agents.length + 1); saveState(); showToast("研究方案已确认"); setTimeout(() => go("variables"), 450); });
    document.getElementById("confirm-governance")?.addEventListener("click", () => { state.governanceConfirmed = true; saveState(); showToast("数据治理规则已确认"); setTimeout(() => go("analysisPlan"), 450); });
    document.getElementById("confirm-analysis-plan")?.addEventListener("click", () => { state.analysisPlanConfirmed = true; state.analysisMethod = "iptw"; saveState(); showToast("分析方案已确认，主分析设为IPTW"); setTimeout(() => go("analysis"), 450); });
    document.getElementById("print-report")?.addEventListener("click", () => window.print());
    document.getElementById("download-report")?.addEventListener("click", downloadReport);
    document.getElementById("export-map")?.addEventListener("click", exportVariableMap);
  }

  function runAgents() {
    const q = document.getElementById("research-question");
    state.question = q?.value || config.study.naturalQuestion;
    state.workflowStep = 1;
    state.studyConfirmed = false;
    saveState(); render();
    const timer = setInterval(() => {
      state.workflowStep += 1;
      saveState(); render();
      if (state.workflowStep >= config.agents.length + 1) {
        clearInterval(timer);
        state.workflowStep = config.agents.length + 1;
        saveState();
        showToast("Agent工作流执行完成，请人工确认研究方案");
      }
    }, 620);
  }

  function downloadReport() {
    const blob = new Blob(["\ufeff" + reportMarkdown()], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "AECOPD_RWS探索性研究报告.md";
    link.click();
    URL.revokeObjectURL(link.href);
    showToast("研究报告已下载");
  }

  function openDrawer(html) {
    drawer.innerHTML = `<button class="drawer-close" id="drawer-close">×</button>${html}`;
    drawer.classList.remove("hidden"); backdrop.classList.remove("hidden");
    document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  }
  function closeDrawer() { drawer.classList.add("hidden"); backdrop.classList.add("hidden"); }

  function openPatient(id) {
    const p = patients.find(x => x.id === id); if (!p) return;
    const status = p.hasEligibleIndex ? "研究就绪患者" : "未形成合格索引住院";
    const timeline = p.hasEligibleIndex
      ? `<div class="timeline"><div class="timeline-item"><span>${p.admissionDate}</span><strong>索引住院 ${p.encounterId} · 主要ICD-9 ${p.primaryDiagnosisCode}</strong></div><div class="timeline-item"><span>${p.dischargeDate}</span><strong>存活出院 · ${p.treatment}</strong></div><div class="timeline-item"><span>暴露判定</span><strong>${p.tiotropiumExposed ? "处方包含Tiotropium且route=INH" : "未使用Tiotropium，存在其他标准吸入治疗"}</strong></div><div class="timeline-item"><span>30天全因结局</span><strong>${p.readmitted30d ? `${p.readmissionDate} 再入院（${p.readmissionType}，间隔${p.readmissionGapDays}天）` : "当前数据源内未记录30天再入院"}</strong></div></div>`
      : `<div class="alert red section-gap"><strong>!</strong><div><b>排除原因：</b>${p.exclusionReasons.join("；") || "没有满足全部纳排标准的住院"}</div></div>`;
    openDrawer(`<span class="badge ${p.hasEligibleIndex ? "green" : "red"}">${status}</span><h2>${p.name} · ${p.id}</h2><div class="drawer-subtitle">${p.age ?? "—"}岁 · ${p.sex} · ${p.rawAdmissions.length}次住院${p.encounterId ? ` · 索引住院 ${p.encounterId}` : ""}</div>
      <div class="grid grid-3 section-gap">${definition("主要ICD-9", p.primaryDiagnosisCode ?? "未形成索引")}${definition("既往365天住院", p.priorAdmissions ?? "—")}${definition("索引住院ICU", p.hasEligibleIndex ? p.icu ? "是" : "否" : "—")}</div>
      ${timeline}
      ${rawTable("PATIENTS 原始记录", [p.rawPatient], [["subject_id", "subject_id"], ["gender", "gender"], ["dob", "dob"], ["expire_flag", "expire_flag"], ["dod", "dod"]])}
      ${rawTable("ADMISSIONS 原始记录", p.rawAdmissions, [["hadm_id", "hadm_id"], ["admittime", "admittime"], ["dischtime", "dischtime"], ["type", "admission_type"], ["diagnosis", "diagnosis"], ["expire", "hospital_expire_flag"]])}
      ${rawTable("索引住院 DIAGNOSES_ICD", p.rawDiagnoses, [["seq", "seq_num"], ["icd9_code", "icd9_code"], ["hadm_id", "hadm_id"]])}
      ${rawTable("索引住院 PRESCRIPTIONS", p.rawPrescriptions, [["drug", "drug"], ["route", "route"], ["startdate", "startdate"], ["enddate", "enddate"], ["dose", "dose_val_rx"], ["unit", "dose_unit_rx"]])}
      ${rawTable("索引住院 ICUSTAYS", p.rawIcuStays, [["icustay_id", "icustay_id"], ["careunit", "first_careunit"], ["intime", "intime"], ["outtime", "outtime"], ["los", "los"]])}`);
  }

  function openVariable(key) {
    const v = config.variableDictionary.find(x => x.key === key); if (!v) return;
    const sample = patients.find(p => p[key] != null) || patients[0];
    openDrawer(`<span class="badge green">标准研究变量</span><h2>${v.label}</h2><div class="drawer-subtitle mono">${v.key}</div>
      <div class="definition-grid section-gap">${definition("变量用途", v.type)}${definition("是否必需", v.required ? "必需" : "可选")}${definition("原始字段", v.raw)}${definition("业务来源", v.source)}</div>
      <h3 class="section-gap">标准化规则</h3><div class="raw-text">${v.rule}</div>
      <h3 class="section-gap">三层数据示例</h3><ul class="list-clean"><li><strong>原始层：</strong>${esc(v.raw)}</li><li><strong>标准/派生值：</strong>${esc(sample[key] ?? "当前数据源缺失")}</li><li><strong>研究用途：</strong>用于${v.type}定义、队列筛选、质量提示或模型调整</li><li><strong>转换方式：</strong>${v.available === false ? "当前CSV不可派生，等待补充数据" : "确定性规则映射，可重复执行"}</li></ul>`);
  }

  function openStage(index) {
    const cohort = deriveCohort(); const stage = cohort.stages[index]; const previous = index ? cohort.stages[index - 1] : null;
    const excluded = previous ? previous.patients.filter(p => !stage.patients.some(s => s.id === p.id)) : [];
    openDrawer(`<span class="badge blue">队列筛选步骤 ${index + 1}</span><h2>${stage.label}</h2><div class="drawer-subtitle">${stage.reason}</div><div class="grid grid-2 section-gap">${definition("保留患者", stage.patients.length)}${definition("本步排除", excluded.length)}</div><h3 class="section-gap">本步规则</h3><div class="raw-text mono">${stage.reason}</div><h3 class="section-gap">${excluded.length ? "被排除患者示例" : "当前患者示例"}</h3><div class="table-wrap"><table><thead><tr><th>患者</th><th>索引住院</th><th>出院状态</th><th>排除原因/观察天数</th></tr></thead><tbody>${(excluded.length ? excluded : stage.patients).slice(0,12).map(p => `<tr><td><button class="table-link" data-patient-in-drawer="${p.id}">${p.id}</button></td><td>${p.encounterId ?? "—"}</td><td>${p.dischargeStatus}</td><td>${p.exclusionReasons.length ? p.exclusionReasons.join("；") : p.observationDays ?? "—"}</td></tr>`).join("")}</tbody></table></div>`);
    drawer.querySelectorAll("[data-patient-in-drawer]").forEach(btn => btn.addEventListener("click", () => openPatient(btn.dataset.patientInDrawer)));
  }

  function exportVariableMap() {
    const rows = config.variableDictionary.map(v => [v.label, v.key, v.type, v.source, v.raw, v.rule].map(x => `"${String(x).replaceAll('"','""')}"`).join(","));
    const csv = "变量名称,标准字段,用途,数据来源,原始字段,转换规则\n" + rows.join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "RWS变量映射.csv"; a.click(); URL.revokeObjectURL(a.href); showToast("变量映射已导出");
  }

  nav.addEventListener("click", (e) => { const btn = e.target.closest("[data-page]"); if (btn) go(btn.dataset.page); });
  document.querySelectorAll("[data-go]").forEach(btn => btn.addEventListener("click", () => go(btn.dataset.go)));
  document.getElementById("reset-demo").addEventListener("click", () => { ["rws-page", "rws-workflow-step", "rws-study-confirmed", "rws-governance-confirmed", "rws-analysis-plan-confirmed", "rws-question", "rws-analysis-method"].forEach(key => localStorage.removeItem(key)); Object.assign(state, { page: "overview", workflowStep: 0, studyConfirmed: false, governanceConfirmed: false, analysisPlanConfirmed: false, question: config.study.naturalQuestion, analysisMethod: "crude" }); showToast("演示状态已重置"); render(); });
  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  render();
})();
