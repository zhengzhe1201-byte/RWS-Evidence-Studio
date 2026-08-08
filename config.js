window.RWS_CONFIG = {
  navigation: [
    { id: "overview", label: "项目总览", icon: "⌂" },
    { id: "cases", label: "患者病例库", icon: "▤" },
    { id: "question", label: "研究问题", icon: "✦" },
    { id: "variables", label: "变量中心", icon: "≡" },
    { id: "cohort", label: "队列构建", icon: "◉" },
    { id: "quality", label: "质量与可比性", icon: "✓" },
    { id: "analysis", label: "初步分析", icon: "⌁" },
    { id: "evidence", label: "证据摘要", icon: "▣" },
    { id: "boundary", label: "平台边界", icon: "◇" }
  ],
  study: {
    id: "aecopd_tiotropium_readmission_30d",
    title: "Tiotropium 与 AECOPD 患者30天再入院率的关联",
    naturalQuestion: "对于年龄≥50岁的 AECOPD 住院患者，index admission 期间使用 Tiotropium 是否与出院后30天全因再入院率降低相关？",
    population: "年龄≥50岁、主要诊断为AECOPD并存活出院的住院患者",
    exposure: "首次合格住院期间存在 Tiotropium 吸入处方",
    comparator: "未使用 Tiotropium，但接受 Albuterol/Ipratropium 等标准治疗",
    outcome: "出院后1—30天内当前数据源记录的全因再入院",
    indexDate: "首次满足纳排标准住院的出院日期",
    timeWindow: "0 < 下次入院时间−索引出院时间 ≤ 30天",
    inclusions: ["年龄≥50岁", "主要诊断ICD-9为49122/49322/496", "存活出院", "具有完整处方记录", "至少30天数据观察窗口"],
    exclusions: ["index admission为择期住院", "住院期间死亡", "无法判定Tiotropium暴露", "关键日期缺失"],
    confounders: ["年龄", "性别", "既往住院次数", "ICU入住", "合并诊断数量", "GOLD/CAT/吸烟等当前缺失变量"]
  },
  agents: [
    { id: "question", name: "研究问题定义 Agent", desc: "把自然语言问题转成可执行研究定义" },
    { id: "mapping", name: "变量映射 Agent", desc: "识别所需变量并连接原始病例字段" },
    { id: "cohort", name: "队列构建 Agent", desc: "执行入排规则并划分暴露组与对照组" },
    { id: "quality", name: "质量检查 Agent", desc: "检查缺失、异常、数据覆盖与组间差异" },
    { id: "evidence", name: "证据生成 Agent", desc: "调用确定性计算并生成审慎的证据摘要" }
  ],
  variableDictionary: [
    { key: "age", label: "索引住院年龄", raw: "PATIENTS.dob + ADMISSIONS.admittime", source: "PATIENTS / ADMISSIONS", type: "基线", required: true, rule: "索引入院日期减出生日期，向下取整为周岁" },
    { key: "sex", label: "性别", raw: "PATIENTS.gender", source: "PATIENTS", type: "基线", required: true, rule: "M/F标准化为男/女" },
    { key: "primaryDiagnosisCode", label: "主要诊断ICD-9", raw: "DIAGNOSES_ICD.icd9_code", source: "DIAGNOSES_ICD", type: "入组", required: true, rule: "seq_num=1且去除小数点后属于49122/49322/496" },
    { key: "priorAdmissions", label: "索引前365天住院次数", raw: "ADMISSIONS.admittime", source: "ADMISSIONS", type: "混杂", required: false, rule: "同一subject_id索引日前365天内住院计数；受数据起始时间限制" },
    { key: "icu", label: "索引住院ICU入住", raw: "ICUSTAYS.hadm_id", source: "ICUSTAYS", type: "混杂", required: false, rule: "索引hadm_id存在ICUSTAYS记录则为是" },
    { key: "comorbidityCount", label: "合并诊断数量", raw: "DIAGNOSES_ICD.seq_num", source: "DIAGNOSES_ICD", type: "混杂", required: false, rule: "索引住院seq_num>1的诊断条数，仅作粗略代理" },
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
