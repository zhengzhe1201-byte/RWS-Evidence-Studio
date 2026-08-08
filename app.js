(function () {
  const config = window.RWS_CONFIG;
  const patients = window.RWS_DATA.patients;
  const metadata = window.RWS_DATA.metadata;
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
    question: localStorage.getItem("rws-question") || config.study.naturalQuestion,
    caseSearch: "",
    diagnosisFilter: "全部",
    treatmentFilter: "全部"
  };
  if (!["全部", "已形成索引住院", "未形成索引住院"].includes(state.diagnosisFilter)) state.diagnosisFilter = "全部";
  if (!["全部", "Tiotropium", "其他标准治疗", "未分类"].includes(state.treatmentFilter)) state.treatmentFilter = "全部";

  function saveState() {
    localStorage.setItem("rws-page", state.page);
    localStorage.setItem("rws-workflow-step", String(state.workflowStep));
    localStorage.setItem("rws-study-confirmed", String(state.studyConfirmed));
    localStorage.setItem("rws-question", state.question);
  }

  function mean(values) {
    const valid = values.filter((v) => typeof v === "number" && !Number.isNaN(v));
    return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  }
  function variance(values) {
    const m = mean(values);
    return values.length > 1 ? values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1) : 0;
  }
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
    const tEvents = cohort.treatment.filter((p) => p.readmitted30d).length;
    const cEvents = cohort.control.filter((p) => p.readmitted30d).length;
    const tRate = tEvents / Math.max(1, cohort.treatment.length);
    const cRate = cEvents / Math.max(1, cohort.control.length);
    const riskDifference = tRate - cRate;
    const relativeRisk = cRate ? tRate / cRate : 0;
    let ci = [0, 0];
    if (tEvents && cEvents) {
      const seLog = Math.sqrt((1 / tEvents) - (1 / cohort.treatment.length) + (1 / cEvents) - (1 / cohort.control.length));
      ci = [Math.exp(Math.log(relativeRisk) - 1.96 * seLog), Math.exp(Math.log(relativeRisk) + 1.96 * seLog)];
    }
    return { ...cohort, tEvents, cEvents, tRate, cRate, riskDifference, relativeRisk, ci };
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
          <span class="hero-tag">DATA → COHORT → EVIDENCE</span>
          <h2>让散落在病例里的数据，变成可执行、可追溯的研究流程</h2>
          <p>从一个自然语言研究问题出发，自动完成研究定义、变量映射、队列筛选、质量检查与探索性分析。AI负责理解和解释，确定性代码负责筛选和计算。</p>
          <div class="hero-actions">
            <button class="primary-button" data-go="question">运行 COPD 示例</button>
            <button class="ghost-button" data-go="boundary">查看平台边界</button>
          </div>
        </div>
        <div class="hero-visual">
          <div class="orbit"></div><div class="orbit"></div>
          <div class="core-node">可信任<br>研究证据</div>
          <div class="orbit-node node-a">原始病例</div><div class="orbit-node node-b">标准变量</div>
          <div class="orbit-node node-c">研究队列</div><div class="orbit-node node-d">质量控制</div>
        </div>
      </section>

      <section class="grid grid-4 section-gap">
        ${metric("AECOPD虚拟患者", patients.length, "来自彦斌提供的五张MIMIC-III风格CSV", "▤")}
        ${metric("研究就绪队列", analysis.final.length, "首次合格住院且观察窗口完整", "◉")}
        ${metric("标准研究变量", config.variableDictionary.length, "均保留来源、规则与人工确认状态", "≡")}
        ${metric("Agent工作模块", config.agents.length, "从研究问题到证据摘要的任务链", "✦")}
      </section>

      <section class="card section-gap">
        <div class="card-header"><div><h3>平台如何工作</h3><p>前一步输出成为后一步输入，而不是若干互不相连的AI功能。</p></div><span class="badge green">完整闭环</span></div>
        <div class="flow">
          ${["病例入库", "研究定义", "变量映射", "队列构建", "质量检查", "证据摘要"].map((x, i) => `<div class="flow-step"><span>STEP ${i + 1}</span><strong>${x}</strong></div>`).join("")}
        </div>
      </section>

      <section class="grid grid-2 section-gap">
        <div class="card">
          <div class="card-header"><div><h3>当前示例研究</h3><p>围绕一个具体问题做深，而不是堆叠疾病和功能。</p></div><span class="badge blue">回顾性队列</span></div>
          <h3>${config.study.title}</h3>
          <ul class="list-clean section-gap">
            <li><strong>研究对象：</strong>${config.study.population}</li>
            <li><strong>暴露：</strong>${config.study.exposure}</li>
            <li><strong>对照：</strong>${config.study.comparator}</li>
            <li><strong>结局：</strong>${config.study.outcome}</li>
          </ul>
        </div>
        <div class="card">
          <div class="card-header"><div><h3>为什么不是“AI直接回答”</h3><p>真实世界数据需要经过中间桥梁，才能成为可信分析输入。</p></div></div>
          <ul class="list-clean">
            <li class="check">原始值、标准值与派生值分层保存</li>
            <li class="check">每个变量可以回溯至病历或业务系统</li>
            <li class="check">队列筛选规则与排除原因公开透明</li>
            <li class="check">统计数字由代码动态计算</li>
            <li class="check">结论明确区分相关性与因果性</li>
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
              <div class="template-pills"><button class="template-pill active">30天再入院率</button><button class="template-pill" data-preview="AE/SAE">AE/SAE（待配置）</button><button class="template-pill" data-preview="依从性">用药依从性（待配置）</button></div>
              <button id="run-agents" class="primary-button">运行 Agent 工作流</button>
            </div>
          </div>
          <div class="card section-gap">
            <div class="card-header"><div><h3>Agent 执行链</h3><p>每个Agent只承担边界明确的研究任务。</p></div></div>
            <div class="agent-list">
              ${config.agents.map((a, i) => `<div class="agent-row ${state.workflowStep > i ? "done" : state.workflowStep === i && state.workflowStep > 0 ? "running" : ""}"><div class="agent-index">${state.workflowStep > i ? "✓" : i + 1}</div><div><strong>${a.name}</strong><small>${a.desc}</small></div><div class="agent-status">${state.workflowStep > i ? "已完成" : state.workflowStep === i && state.workflowStep > 0 ? "执行中…" : "等待"}</div></div>`).join("")}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><div><h3>结构化研究定义</h3><p>自然语言必须先变成可确认、可执行的研究规格。</p></div><span class="badge ${state.studyConfirmed ? "green" : "amber"}">${state.studyConfirmed ? "已人工确认" : "等待确认"}</span></div>
          <div class="definition-grid">
            ${definition("P · 研究对象", config.study.population)}${definition("E · 暴露", config.study.exposure)}
            ${definition("C · 对照", config.study.comparator)}${definition("O · 研究结局", config.study.outcome)}
            ${definition("INDEX · 索引日期", config.study.indexDate)}${definition("TIME · 时间窗口", config.study.timeWindow)}
          </div>
          <div class="grid grid-2 section-gap">
            <div><h4>纳入标准</h4><ul class="list-clean">${config.study.inclusions.map(x => `<li class="check">${x}</li>`).join("")}</ul></div>
            <div><h4>排除标准</h4><ul class="list-clean">${config.study.exclusions.map(x => `<li class="cross">${x}</li>`).join("")}</ul></div>
          </div>
          <div class="section-gap"><h4>建议控制的混杂因素</h4><div class="template-pills section-gap">${config.study.confounders.map(x => `<span class="template-pill active">${x}</span>`).join("")}</div></div>
          <div class="section-gap"><button id="confirm-study" class="${state.studyConfirmed ? "secondary-button" : "primary-button"}">${state.studyConfirmed ? "已确认，进入变量中心" : "人工确认研究定义"}</button></div>
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
    return [
      { label: "年龄", t: mean(treatment.map(p => p.age)), c: mean(control.map(p => p.age)), smd: smdNumeric(treatment.map(p => p.age), control.map(p => p.age)), unit: "岁" },
      { label: "女性", t: treatment.filter(p => p.sex === "女").length / treatment.length, c: control.filter(p => p.sex === "女").length / control.length, smd: smdBinary(treatment.map(p => p.sex === "女"), control.map(p => p.sex === "女")), percent: true },
      { label: "既往住院次数", t: mean(treatment.map(p => p.priorAdmissions)), c: mean(control.map(p => p.priorAdmissions)), smd: smdNumeric(treatment.map(p => p.priorAdmissions), control.map(p => p.priorAdmissions)), unit: "次" },
      { label: "索引住院进入ICU", t: treatment.filter(p => p.icu).length / treatment.length, c: control.filter(p => p.icu).length / control.length, smd: smdBinary(treatment.map(p => p.icu), control.map(p => p.icu)), percent: true },
      { label: "合并诊断数量", t: mean(treatment.map(p => p.comorbidityCount)), c: mean(control.map(p => p.comorbidityCount)), smd: smdNumeric(treatment.map(p => p.comorbidityCount), control.map(p => p.comorbidityCount)), unit: "个" }
    ];
  }

  function renderQuality() {
    const rows = balanceData();
    const maxSmd = Math.max(...rows.map(r => r.smd));
    return `
      <section class="grid grid-3">
        ${metric("核心派生字段完整率", pct(deriveCohort().final.length / patients.length), "181/200可形成研究就绪记录", "✓")}
        ${metric("最大标准化差异", maxSmd.toFixed(2), "一般以SMD>0.10提示值得关注", "↔")}
        ${metric("结局来源覆盖", "单一", "仅当前AECOPD虚拟住院数据", "◎")}
      </section>
      <section class="grid grid-2 section-gap">
        <div class="card">
          <div class="card-header"><div><h3>治疗组与对照组基线</h3><p>Agent先检查可比性，再决定怎样解释结果。</p></div></div>
          ${rows.map(r => `<div class="balance-row"><div><strong>${r.label}</strong><div class="muted">治疗 ${r.percent ? pct(r.t) : r.t.toFixed(1)+r.unit} · 对照 ${r.percent ? pct(r.c) : r.c.toFixed(1)+r.unit}</div></div><div class="balance-bar"><span style="width:${Math.min(100,r.smd*220)}%;background:${r.smd>.1 ? '#c7821c' : '#087f79'}"></span></div><div class="balance-value" style="color:${r.smd>.1 ? '#b66a05' : '#21845a'}">SMD ${r.smd.toFixed(2)}</div></div>`).join("")}
        </div>
        <div class="grid">
          <div class="alert red"><strong>!</strong><div><b>死亡字段冲突：</b>PATIENTS有${metadata.deathQuality.patientExpireCount}人expire_flag=1，ADMISSIONS有${metadata.deathQuality.hospitalDeathCount}名院内死亡患者，仅${metadata.deathQuality.overlapCount}人重叠。本研究存活出院仅使用ADMISSIONS.hospital_expire_flag。</div></div>
          <div class="alert amber"><strong>!</strong><div><b>结局覆盖限制：</b>未连接区域平台、医保或外院数据，因此“未记录再入院”不等于患者真实未再入院。</div></div>
          <div class="alert amber"><strong>!</strong><div><b>关键混杂缺失：</b>GOLD、CAT、吸烟、肺功能与依从性未提供，当前只能进行未经调整的描述性比较。</div></div>
          <div class="alert green"><strong>✓</strong><div><b>下一步建议：</b>补充关键临床严重度变量后，再考虑倾向评分、加权或多变量回归；当前结果仅用于验证产品链路。</div></div>
          <div class="card"><h3>自动与人工的边界</h3><ul class="list-clean section-gap"><li class="check">Agent自动发现数据缺失与组间差异</li><li class="check">程序自动计算描述性指标和SMD</li><li class="cross">临床专家确认混杂因素是否充分</li><li class="cross">统计师确认调整方法与因果假设</li></ul></div>
        </div>
      </section>`;
  }

  function renderAnalysis() {
    const a = deriveAnalysis();
    return `
      <section class="result-hero">
        <div class="result-group"><span>Tiotropium暴露组 · ${a.tEvents}/${a.treatment.length}例再入院</span><div class="result-rate">${pct(a.tRate)}</div><div class="result-bar"><i style="width:${a.tRate*300}%"></i></div></div>
        <div class="result-group"><span>其他标准治疗对照组 · ${a.cEvents}/${a.control.length}例再入院</span><div class="result-rate">${pct(a.cRate)}</div><div class="result-bar"><i style="width:${a.cRate*300}%;background:#84a8da"></i></div></div>
      </section>
      <section class="grid grid-4 section-gap">
        ${metric("绝对风险差", `${(a.riskDifference*100).toFixed(1)}个百分点`, "治疗组减去对照组，未经调整", "Δ")}
        ${metric("相对风险 RR", a.relativeRisk.toFixed(2), "RR<1表示观察到较低风险", "RR")}
        ${metric("RR 95%区间", a.ci[0] ? `${a.ci[0].toFixed(2)}—${a.ci[1].toFixed(2)}` : "样本不足", "简化Wald估计，仅供演示", "CI")}
        ${metric("分析样本", a.final.length, "首次合格索引住院的患者", "n")}
      </section>
      <section class="grid grid-2 section-gap">
        <div class="analysis-callout"><span class="badge amber">探索性关联</span><h3>当前数据观察到</h3><strong>${a.riskDifference < 0 ? "Tiotropium组再入院率较低" : "Tiotropium组再入院率未降低"}</strong><p>未经调整的风险差为 ${(a.riskDifference*100).toFixed(1)} 个百分点，相对风险为 ${a.relativeRisk.toFixed(2)}。这描述的是当前虚拟队列中的关联，不代表药物造成了这一差异。</p><button class="primary-button" data-go="evidence">生成证据摘要</button></div>
        <div class="card"><div class="card-header"><div><h3>计算方法</h3><p>数字由五张CSV和确定性规则动态派生。</p></div><span class="badge green">可复算</span></div><ul class="list-clean"><li><strong>索引住院：</strong>每名患者首次满足年龄、主诊断、非择期、存活出院和处方要求的住院</li><li><strong>暴露定义：</strong>索引住院处方drug=Tiotropium且route=INH</li><li><strong>结局定义：</strong>出院后1—30天内当前数据源记录的全因再入院</li><li><strong>粗风险：</strong>事件人数÷对应组总人数</li><li><strong>当前未执行：</strong>倾向评分、回归调整、缺失数据插补</li></ul></div>
      </section>`;
  }

  function renderEvidence() {
    const a = deriveAnalysis();
    const direction = a.riskDifference < 0 ? "较低" : "较高";
    return `
      <section class="evidence-paper">
        <span class="eyebrow">EXPLORATORY EVIDENCE BRIEF</span><h2>${config.study.title}</h2>
        <span class="confidence">证据可信度：探索性 / 需要人工与统计复核</span>
        <div class="evidence-section"><h4>研究设计</h4><p>基于卜彦斌提供的AECOPD虚拟CSV构建回顾性队列。纳入年龄≥50岁、主要诊断ICD-9为49122/49322/496、非择期且存活出院并有处方记录的患者，每名患者取首次合格住院为index admission。</p></div>
        <div class="evidence-section"><h4>主要结果</h4><p>最终纳入 ${a.final.length} 名患者，其中Tiotropium暴露组 ${a.treatment.length} 人，对照组 ${a.control.length} 人。两组30天全因再入院率分别为 ${pct(a.tRate)} 和 ${pct(a.cRate)}。Tiotropium组观察到的再入院率${direction}，未经调整风险差为 ${(a.riskDifference*100).toFixed(1)} 个百分点，相对风险为 ${a.relativeRisk.toFixed(2)}，简化95%区间为 ${a.ci[0].toFixed(2)}—${a.ci[1].toFixed(2)}。</p></div>
        <div class="evidence-section"><h4>可以得出的结论</h4><p>在当前虚拟数据与既定规则下，平台可以从关系型原始表复现索引住院、药物暴露、30天结局和探索性组间比较。结果可作为进一步完善研究设计和数据采集的假设线索。</p></div>
        <div class="evidence-section"><h4>不能得出的结论</h4><p>治疗并非随机分配，GOLD、CAT、吸烟等关键混杂变量缺失，且单一数据源可能漏掉外院住院。当前结果不能证明Tiotropium造成再入院风险变化，也不能用于临床决策、监管申报或药品宣传。</p></div>
        <div class="evidence-section"><h4>下一步研究建议</h4><p>由临床和流行病学专家确认index、暴露及全因结局定义；补充跨院结局与疾病严重度变量；开展计划住院排除、不同暴露窗口和统计调整的敏感性分析；由统计师复核代码与报告。</p></div>
        <div class="evidence-section"><h4>数据溯源</h4><p>所有分析变量均保留原始字段、标准化规则和派生逻辑。点击下方按钮可查看变量中心和患者级原始病例。</p><div class="section-gap"><button class="secondary-button" data-go="variables">查看变量溯源</button> <button class="ghost-button" data-go="cases">查看患者病例</button></div></div>
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

  const renderers = { overview: renderOverview, cases: renderCases, question: renderQuestion, variables: renderVariables, cohort: renderCohort, quality: renderQuality, analysis: renderAnalysis, evidence: renderEvidence, boundary: renderBoundary };

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
    const question = document.getElementById("research-question");
    if (question) question.addEventListener("change", (e) => { state.question = e.target.value; saveState(); });
    document.getElementById("run-agents")?.addEventListener("click", runAgents);
    document.getElementById("confirm-study")?.addEventListener("click", () => { state.studyConfirmed = true; state.workflowStep = Math.max(state.workflowStep, 5); saveState(); showToast("研究定义已确认"); setTimeout(() => go("variables"), 450); });
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
        showToast("Agent工作流执行完成，请人工确认研究定义");
      }
    }, 620);
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
  document.getElementById("reset-demo").addEventListener("click", () => { localStorage.removeItem("rws-page"); localStorage.removeItem("rws-workflow-step"); localStorage.removeItem("rws-study-confirmed"); localStorage.removeItem("rws-question"); Object.assign(state, { page: "overview", workflowStep: 0, studyConfirmed: false, question: config.study.naturalQuestion }); showToast("演示状态已重置"); render(); });
  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

  render();
})();
