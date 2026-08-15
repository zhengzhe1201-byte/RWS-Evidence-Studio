window.RWS_CONFIG = {
  navigation: [
    { id: "overview", label: "项目总览", icon: "⌂" },
    { id: "cases", label: "患者病例库", icon: "▤" },
    { id: "question", label: "研究方案", icon: "✦" },
    { id: "variables", label: "变量中心", icon: "≡" },
    { id: "cohort", label: "队列构建", icon: "◉" },
    { id: "quality", label: "数据治理与质量", icon: "✓" },
    { id: "analysisPlan", label: "分析方案", icon: "⌘" },
    { id: "analysis", label: "效应估计", icon: "⌁" },
    { id: "sensitivity", label: "敏感性分析", icon: "≈" },
    { id: "evidence", label: "研究报告", icon: "▣" },
    { id: "boundary", label: "平台边界", icon: "◇" }
  ],
  product: {
    primaryUser: "真实世界研究统计师",
    collaborators: "研究医生、流行病学人员与数据管理人员",
    positioning: "以数据治理和可复算统计为核心的人机协同研究工作台",
    aiLevel: "L2 智能辅助"
  },
  study: {
    id: "aecopd_tiotropium_readmission_30d",
    title: "Tiotropium 与 AECOPD 患者30天再入院率的关联",
    naturalQuestion: "对于年龄≥50岁的 AECOPD 住院患者，index admission 期间使用 Tiotropium 是否与出院后30天全因再入院率降低相关？",
    objective: "评估索引住院期间使用Tiotropium与出院后30天全因再入院风险之间的关联，并检验该关联在混杂调整和替代分析设定下是否稳定。",
    design: "基于虚拟住院数据的回顾性观察性队列研究",
    population: "年龄≥50岁、主要诊断为AECOPD并存活出院的住院患者",
    exposure: "首次合格住院期间存在 Tiotropium 吸入处方",
    comparator: "未使用 Tiotropium，但接受 Albuterol/Ipratropium 等标准治疗",
    outcome: "出院后1—30天内当前数据源记录的全因再入院",
    indexDate: "首次满足纳排标准住院的出院日期",
    timeWindow: "0 < 下次入院时间−索引出院时间 ≤ 30天",
    primaryEndpoint: "索引出院后1—30天内当前数据源记录的全因再入院（二分类）",
    secondaryEndpoints: [
      "索引出院后1—14天内当前数据源记录的全因再入院",
      "索引出院后30天内首次再入院时间"
    ],
    unsupportedEndpoints: "当前数据不支持药物不良反应、CAT改善或肺功能变化等安全性/症状终点",
    estimand: "符合纳排标准人群中，假设全部接受Tiotropium与全部接受其他标准治疗时的30天再入院风险差与风险比（ATE口径）",
    analysisPopulation: "完整研究队列（181人）；匹配分析另报告成功匹配人群",
    hypothesis: "Tiotropium暴露组的30天再入院风险低于其他标准治疗对照组",
    inclusions: ["年龄≥50岁", "主要诊断ICD-9为49122/49322/496", "存活出院", "具有完整处方记录", "至少30天数据观察窗口"],
    exclusions: ["index admission为择期住院", "住院期间死亡", "无法判定Tiotropium暴露", "关键日期缺失"],
    confounders: ["年龄", "性别", "既往住院次数", "ICU入住", "合并诊断数量", "GOLD/CAT/吸烟等当前缺失变量"]
  },
  agents: [
    { id: "question", name: "研究方案定义 Agent", desc: "把自然语言问题转成可确认的研究目的、终点与估计目标" },
    { id: "mapping", name: "变量映射 Agent", desc: "识别所需变量并连接原始病例字段" },
    { id: "cohort", name: "队列构建 Agent", desc: "执行入排规则并划分暴露组与对照组" },
    { id: "quality", name: "数据治理 Agent", desc: "检查缺失、字段语义、数据覆盖与组间差异" },
    { id: "plan", name: "分析方案 Agent", desc: "依据研究设计和质量诊断推荐统计方法" },
    { id: "evidence", name: "报告生成 Agent", desc: "调用确定性计算并生成可审计的研究报告初稿" }
  ],
  analysisMethods: [
    { id: "crude", label: "粗分析", role: "描述性参照", scope: "直接比较两组原始再入院风险，不进行混杂调整" },
    { id: "multivariable", label: "多变量 Logistic 回归", role: "支持性分析", scope: "在二分类结局模型中同时调整预先指定的基线变量；OR表示优势比，不能直接当作风险比" },
    { id: "iptw", label: "倾向评分加权（IPTW）", role: "建议主分析", scope: "利用稳定化倾向评分权重估计完整队列ATE，并检查重叠、权重、ESS和平衡" },
    { id: "matching", label: "倾向评分1:1匹配", role: "敏感性分析", scope: "为暴露患者寻找已测量基线特征相近的对照患者；结果适用于成功匹配人群" }
  ],
  methodGuide: [
    { question: "先说明研究人群、分布与缺失情况", method: "描述性统计", output: "n（%）、均值±SD或中位数[IQR]、缺失率", status: "已执行", tone: "green", note: "所有研究的第一步；只描述数据，不回答治疗是否造成结局差异。" },
    { question: "探索性比较两组均值或比例", method: "t检验 / 秩和检验 / 卡方 / Fisher", output: "组间差、效应量、95%CI和P值", status: "按需启用", tone: "amber", note: "需根据变量分布、独立性和期望频数选择；不能用P值判定基线平衡，也不能控制混杂。" },
    { question: "二分类结局，需同时调整多个基线因素", method: "多变量 Logistic 回归", output: "调整OR及95%CI；可补充标准化风险与风险差", status: "已执行", tone: "green", note: "本研究30天再入院是二分类终点；OR描述优势而非风险，事件数有限时需控制模型复杂度。" },
    { question: "关心事件是否发生以及多久发生", method: "Kaplan–Meier / log-rank / Cox", output: "生存曲线、HR及95%CI", status: "条件未满足", tone: "red", note: "须先明确时间零点、随访来源、删失和竞争风险，并检查比例风险假设；当前不伪造该结果。" },
    { question: "非随机治疗且两组基线不同", method: "倾向评分 PSM / IPTW", output: "目标人群效应、重叠、权重/匹配损失、调整后SMD", status: "已执行", tone: "green", note: "只能改善已测量且暴露前协变量的平衡，不能把观察性数据变成随机试验。" }
  ],
  dataSources: [
    { name: "住院EMR", status: "已接入", detail: "PATIENTS、ADMISSIONS、DIAGNOSES_ICD、PRESCRIPTIONS、ICUSTAYS", impact: "支持本院索引住院、暴露、基线变量和再入院识别" },
    { name: "医保/理赔", status: "未接入", detail: "跨机构就诊与支付记录", impact: "可能漏掉外院30天再入院" },
    { name: "区域平台", status: "未接入", detail: "跨院住院和转诊记录", impact: "结局覆盖仅限当前模拟住院源" },
    { name: "PRO患者自报", status: "未接入", detail: "CAT、mMRC、症状和依从性", impact: "无法评价症状改善与患者体验" },
    { name: "专病临床数据", status: "未接入", detail: "GOLD、肺功能、吸烟史", impact: "存在无法由统计方法消除的未测量混杂" }
  ],
  governanceIssues: [
    { id: "death_semantics", title: "死亡字段语义与统计口径不同", fields: "PATIENTS.expire_flag / ADMISSIONS.hospital_expire_flag", finding: "患者级字段反映患者死亡状态，住院级字段反映某次住院是否院内死亡，两者不要求完全重合。", rule: "本研究的‘存活出院’使用索引住院ADMISSIONS.hospital_expire_flag；患者级字段仅作补充质控。", reviewer: "临床专家 + 数据管理员" },
    { id: "age_derivation", title: "年龄来源可能存在一岁口径差异", fields: "PATIENTS.dob + ADMISSIONS.admittime", finding: "直接摘录年龄可能因周岁算法或记录时间不同产生非明显差异。", rule: "统一使用出生日期与索引入院日期计算周岁，不直接采用自由文本年龄。", reviewer: "数据管理员" },
    { id: "external_readmission", title: "外院再入院无法识别", fields: "ADMISSIONS（当前单一数据源）", finding: "‘未记录再入院’不等于患者真实未再入院，结局可能存在漏报。", rule: "结果统一表述为‘当前数据源记录的再入院’，并在报告中降低证据确定性。", reviewer: "统计师 + 研究医生" },
    { id: "unmeasured_confounding", title: "关键临床严重度变量缺失", fields: "GOLD / CAT / 吸烟 / 肺功能 / 依从性", finding: "现有回归、加权和匹配只能调整已测量变量。", rule: "保留未测量混杂警告；当前结果只解释为探索性关联，不作药物因果结论。", reviewer: "统计师 + 临床专家" }
  ],
  analysisPlan: {
    trigger: "最大基线SMD为0.27，高于0.10关注阈值，且暴露并非随机分配。",
    recommendation: "若倾向评分重叠与权重稳定，采用IPTW估计完整研究队列ATE；同时报告粗分析和多变量Logistic，使用1:1匹配检验稳健性。",
    prerequisites: ["基于临床知识或因果图预先指定暴露前混杂因素，不按P值机械筛选", "排除暴露后的中介或碰撞变量，并核对ICU/合并诊断相对首次用药的时间顺序", "检查倾向评分重叠与极端权重", "报告调整前后SMD和有效样本量", "由统计师确认方法、估计目标和区间估计"],
    caution: "SMD>0.10用于触发调整警告和方法推荐；加权或匹配只改善已测量基线特征的可比性，不能宣告混杂已经消除，也不能把观察性研究变成随机试验。"
  },
  variableDictionary: [
    { key: "age", label: "索引住院年龄", raw: "PATIENTS.dob + ADMISSIONS.admittime", source: "PATIENTS / ADMISSIONS", type: "基线", required: true, rule: "索引入院日期减出生日期，向下取整为周岁" },
    { key: "sex", label: "性别", raw: "PATIENTS.gender", source: "PATIENTS", type: "基线", required: true, rule: "M/F标准化为男/女" },
    { key: "primaryDiagnosisCode", label: "主要诊断ICD-9", raw: "DIAGNOSES_ICD.icd9_code", source: "DIAGNOSES_ICD", type: "入组", required: true, rule: "seq_num=1且去除小数点后属于49122/49322/496" },
    { key: "priorAdmissions", label: "索引前365天住院次数", raw: "ADMISSIONS.admittime", source: "ADMISSIONS", type: "混杂", required: false, rule: "同一subject_id索引日前365天内住院计数；受数据起始时间限制" },
    { key: "icu", label: "索引住院ICU入住", raw: "ICUSTAYS.hadm_id", source: "ICUSTAYS", type: "候选混杂", required: false, rule: "仅在ICU发生早于首次Tiotropium处方、可视为暴露前严重度信息时纳入正式模型；当前Demo暂作代理并提示人工核对时间顺序" },
    { key: "comorbidityCount", label: "合并诊断数量", raw: "DIAGNOSES_ICD.seq_num", source: "DIAGNOSES_ICD", type: "候选混杂", required: false, rule: "索引住院seq_num>1诊断条数仅为粗略代理；正式模型需确认诊断在暴露前已存在，避免纳入暴露后信息" },
    { key: "tiotropiumExposed", label: "Tiotropium住院期暴露", raw: "PRESCRIPTIONS.drug + route", source: "PRESCRIPTIONS", type: "暴露", required: true, rule: "索引hadm_id内drug=Tiotropium且route=INH" },
    { key: "readmitted30d", label: "30天全因再入院", raw: "ADMISSIONS.admittime/dischtime", source: "ADMISSIONS", type: "结局", required: true, rule: "同一subject_id下一次admittime与索引dischtime间隔为1—30天" },
    { key: "observationComplete", label: "30天观察窗口完整", raw: "ADMISSIONS.dischtime + 数据截止日", source: "ADMISSIONS", type: "质控", required: true, rule: "数据截止日−索引出院日期≥30天" },
    { key: "outcomeSource", label: "结局数据来源", raw: "AECOPD虚拟数据.ADMISSIONS", source: "单一模拟住院数据源", type: "质控", required: true, rule: "仅标记当前数据源内记录，不能识别未接入的外院住院" },
    { key: "goldGrade", label: "GOLD分级", raw: "未提供", source: "当前CSV缺失", type: "混杂", required: false, rule: "不可派生；不得使用原Demo模拟值", available: false },
    { key: "catBaseline", label: "基线CAT评分", raw: "未提供", source: "当前CSV缺失", type: "混杂", required: false, rule: "不可派生；需要额外量表或病历数据", available: false },
    { key: "smoking", label: "吸烟状态", raw: "未提供", source: "当前CSV缺失", type: "混杂", required: false, rule: "不可派生；需要病史或结构化吸烟字段", available: false },
    { key: "adherence", label: "30天用药依从性", raw: "未提供", source: "当前CSV缺失", type: "过程", required: false, rule: "不可派生；需要随访或配药记录", available: false }
  ]
};
