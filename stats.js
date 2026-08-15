(function () {
  const EPS = 1e-8;
  const covariates = [
    { key: "age", label: "年龄", binary: false, value: (p) => p.age },
    { key: "female", label: "女性", binary: true, value: (p) => p.sex === "女" ? 1 : 0 },
    { key: "priorAdmissions", label: "既往365天住院次数", binary: false, value: (p) => p.priorAdmissions },
    { key: "icu", label: "索引住院ICU入住", binary: true, value: (p) => p.icu ? 1 : 0 },
    { key: "comorbidityCount", label: "合并诊断数量", binary: false, value: (p) => p.comorbidityCount }
  ];

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function sigmoid(value) {
    if (value >= 0) return 1 / (1 + Math.exp(-value));
    const exp = Math.exp(value);
    return exp / (1 + exp);
  }
  function dot(a, b) { return a.reduce((sum, value, i) => sum + value * b[i], 0); }
  function mean(values) { return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length); }
  function variance(values) {
    const avg = mean(values);
    return values.length > 1 ? values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1) : 0;
  }
  function solve(matrix, vector) {
    const n = vector.length;
    const augmented = matrix.map((row, i) => [...row, vector[i]]);
    for (let col = 0; col < n; col += 1) {
      let pivot = col;
      for (let row = col + 1; row < n; row += 1) {
        if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
      }
      if (Math.abs(augmented[pivot][col]) < EPS) augmented[pivot][col] = EPS;
      [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
      const divisor = augmented[col][col];
      for (let j = col; j <= n; j += 1) augmented[col][j] /= divisor;
      for (let row = 0; row < n; row += 1) {
        if (row === col) continue;
        const factor = augmented[row][col];
        for (let j = col; j <= n; j += 1) augmented[row][j] -= factor * augmented[col][j];
      }
    }
    return augmented.map((row) => row[n]);
  }
  function invert(matrix) {
    const n = matrix.length;
    const augmented = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
    for (let col = 0; col < n; col += 1) {
      let pivot = col;
      for (let row = col + 1; row < n; row += 1) {
        if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
      }
      if (Math.abs(augmented[pivot][col]) < EPS) augmented[pivot][col] = EPS;
      [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
      const divisor = augmented[col][col];
      for (let j = 0; j < n * 2; j += 1) augmented[col][j] /= divisor;
      for (let row = 0; row < n; row += 1) {
        if (row === col) continue;
        const factor = augmented[row][col];
        for (let j = 0; j < n * 2; j += 1) augmented[row][j] -= factor * augmented[col][j];
      }
    }
    return augmented.map((row) => row.slice(n));
  }
  function logisticFit(x, y, ridge = 1e-6) {
    const columns = x[0].length;
    let beta = Array(columns).fill(0);
    for (let iteration = 0; iteration < 60; iteration += 1) {
      const probabilities = x.map((row) => clamp(sigmoid(dot(row, beta)), 1e-6, 1 - 1e-6));
      const information = Array.from({ length: columns }, () => Array(columns).fill(0));
      const gradient = Array(columns).fill(0);
      x.forEach((row, i) => {
        const weight = probabilities[i] * (1 - probabilities[i]);
        for (let j = 0; j < columns; j += 1) {
          gradient[j] += row[j] * (y[i] - probabilities[i]);
          for (let k = 0; k < columns; k += 1) information[j][k] += weight * row[j] * row[k];
        }
      });
      for (let j = 1; j < columns; j += 1) {
        information[j][j] += ridge;
        gradient[j] -= ridge * beta[j];
      }
      const delta = solve(information, gradient);
      beta = beta.map((value, i) => value + delta[i]);
      if (Math.max(...delta.map(Math.abs)) < 1e-8) break;
    }
    const probabilities = x.map((row) => clamp(sigmoid(dot(row, beta)), 1e-6, 1 - 1e-6));
    const information = Array.from({ length: columns }, () => Array(columns).fill(0));
    x.forEach((row, i) => {
      const weight = probabilities[i] * (1 - probabilities[i]);
      for (let j = 0; j < columns; j += 1) {
        for (let k = 0; k < columns; k += 1) information[j][k] += weight * row[j] * row[k];
      }
    });
    for (let j = 1; j < columns; j += 1) information[j][j] += ridge;
    return { beta, covariance: invert(information), probabilities };
  }
  function standardizedData(patients) {
    const stats = covariates.map((item) => {
      const values = patients.map(item.value);
      const sd = Math.sqrt(variance(values)) || 1;
      return { ...item, mean: mean(values), sd };
    });
    return {
      stats,
      rows: patients.map((patient) => stats.map((item) => (item.value(patient) - item.mean) / item.sd))
    };
  }
  function basicRates(treatment, control) {
    const tEvents = treatment.filter((p) => p.readmitted30d).length;
    const cEvents = control.filter((p) => p.readmitted30d).length;
    const tRate = tEvents / Math.max(1, treatment.length);
    const cRate = cEvents / Math.max(1, control.length);
    const relativeRisk = cRate ? tRate / cRate : 0;
    let ci = null;
    if (tEvents && cEvents) {
      const se = Math.sqrt(1 / tEvents - 1 / treatment.length + 1 / cEvents - 1 / control.length);
      ci = [Math.exp(Math.log(relativeRisk) - 1.96 * se), Math.exp(Math.log(relativeRisk) + 1.96 * se)];
    }
    return { tEvents, cEvents, tRate, cRate, riskDifference: tRate - cRate, relativeRisk, ci };
  }
  function weightedMean(values, weights) {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return values.reduce((sum, value, i) => sum + value * weights[i], 0) / Math.max(EPS, total);
  }
  function weightedVariance(values, weights) {
    const avg = weightedMean(values, weights);
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    return values.reduce((sum, value, i) => sum + weightAt(weights, i) * (value - avg) ** 2, 0) / Math.max(EPS, total);
  }
  function weightAt(weights, index) { return weights[index] || 0; }
  function weightedBalance(patients, weights) {
    return covariates.map((item) => {
      const treatedValues = [];
      const controlValues = [];
      const treatedWeights = [];
      const controlWeights = [];
      patients.forEach((patient, i) => {
        if (patient.tiotropiumExposed) {
          treatedValues.push(item.value(patient)); treatedWeights.push(weights[i]);
        } else {
          controlValues.push(item.value(patient)); controlWeights.push(weights[i]);
        }
      });
      const treatedMean = weightedMean(treatedValues, treatedWeights);
      const controlMean = weightedMean(controlValues, controlWeights);
      const pooled = Math.sqrt((weightedVariance(treatedValues, treatedWeights) + weightedVariance(controlValues, controlWeights)) / 2);
      return { key: item.key, label: item.label, smd: pooled ? Math.abs(treatedMean - controlMean) / pooled : 0 };
    });
  }
  function weightedMaxSmd(patients, weights) {
    return Math.max(...weightedBalance(patients, weights).map((item) => item.smd));
  }
  function quantile(values, probability) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * probability;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    return lower === upper ? sorted[lower] : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  }
  function distribution(values) {
    return { min: Math.min(...values), q25: quantile(values, .25), median: quantile(values, .5), q75: quantile(values, .75), max: Math.max(...values), mean: mean(values) };
  }
  function propensityModel(patients, bounds = [0.05, 0.95]) {
    const standardized = standardizedData(patients);
    const x = standardized.rows.map((row) => [1, ...row]);
    const y = patients.map((patient) => patient.tiotropiumExposed ? 1 : 0);
    const fit = logisticFit(x, y);
    const propensity = fit.probabilities.map((value) => clamp(value, bounds[0], bounds[1]));
    return { propensity, standardized, fit, bounds };
  }
  function effectiveSampleSize(weights) {
    const sum = weights.reduce((total, value) => total + value, 0);
    const squares = weights.reduce((total, value) => total + value ** 2, 0);
    return squares ? sum ** 2 / squares : 0;
  }

  function crude(patients) {
    const treatment = patients.filter((p) => p.tiotropiumExposed);
    const control = patients.filter((p) => !p.tiotropiumExposed);
    const result = basicRates(treatment, control);
    return {
      id: "crude", label: "粗分析", ...result,
      tLabel: `Tiotropium暴露组 · ${result.tEvents}/${treatment.length}例再入院`,
      cLabel: `其他标准治疗对照组 · ${result.cEvents}/${control.length}例再入院`,
      effectLabel: "相对风险 RR", effectValue: result.relativeRisk, effectCi: result.ci,
      sampleLabel: "分析样本", sampleValue: patients.length,
      adjustment: "不进行混杂调整，直接比较两组观察风险。",
      diagnosticLabel: "原始最大SMD", diagnosticValue: null,
      note: "适合描述原始数据中的组间差异，是其他调整方法的参照。"
    };
  }
  function multivariable(patients) {
    const standardized = standardizedData(patients);
    const x = standardized.rows.map((row, i) => [1, patients[i].tiotropiumExposed ? 1 : 0, ...row]);
    const y = patients.map((patient) => patient.readmitted30d ? 1 : 0);
    const fit = logisticFit(x, y);
    const treatedRisk = mean(standardized.rows.map((row) => sigmoid(dot([1, 1, ...row], fit.beta))));
    const controlRisk = mean(standardized.rows.map((row) => sigmoid(dot([1, 0, ...row], fit.beta))));
    const oddsRatio = Math.exp(fit.beta[1]);
    const se = Math.sqrt(Math.max(0, fit.covariance[1][1]));
    return {
      id: "multivariable", label: "多变量Logistic回归",
      tRate: treatedRisk, cRate: controlRisk, riskDifference: treatedRisk - controlRisk,
      relativeRisk: controlRisk ? treatedRisk / controlRisk : 0,
      tLabel: "模型标准化 · 假设全部患者接受Tiotropium",
      cLabel: "模型标准化 · 假设全部患者接受其他标准治疗",
      effectLabel: "调整后优势比 OR", effectValue: oddsRatio,
      effectCi: [Math.exp(fit.beta[1] - 1.96 * se), Math.exp(fit.beta[1] + 1.96 * se)],
      sampleLabel: "回归样本", sampleValue: patients.length,
      adjustment: `同时纳入${covariates.map((item) => item.label).join("、")}。`,
      diagnosticLabel: "模型参数", diagnosticValue: `${x[0].length}项`,
      note: "适合二分类结局的多变量调整；OR描述优势而非风险，不能直接等同于RR。除OR外，本Demo同时展示模型标准化风险与风险差，正式分析还需检查事件数、模型形式和拟合稳定性。"
    };
  }
  function iptw(patients, options = {}) {
    const propensityBounds = options.propensityBounds || [0.05, 0.95];
    const { propensity } = propensityModel(patients, propensityBounds);
    const treatedProportion = patients.filter((p) => p.tiotropiumExposed).length / patients.length;
    const weights = patients.map((patient, i) => patient.tiotropiumExposed
      ? treatedProportion / propensity[i]
      : (1 - treatedProportion) / (1 - propensity[i]));
    const treatedRows = patients.map((patient, i) => ({ patient, weight: patient.tiotropiumExposed ? weights[i] : 0 }));
    const controlRows = patients.map((patient, i) => ({ patient, weight: patient.tiotropiumExposed ? 0 : weights[i] }));
    const tRate = weightedMean(treatedRows.map((row) => row.patient.readmitted30d ? 1 : 0), treatedRows.map((row) => row.weight));
    const cRate = weightedMean(controlRows.map((row) => row.patient.readmitted30d ? 1 : 0), controlRows.map((row) => row.weight));
    return {
      id: "iptw", label: "倾向评分加权（IPTW）",
      tRate, cRate, riskDifference: tRate - cRate, relativeRisk: cRate ? tRate / cRate : 0,
      tLabel: "IPTW加权后的Tiotropium组风险",
      cLabel: "IPTW加权后的对照组风险",
      effectLabel: "加权相对风险 RR", effectValue: cRate ? tRate / cRate : 0, effectCi: null,
      sampleLabel: "有效样本量 ESS", sampleValue: effectiveSampleSize(weights).toFixed(1),
      adjustment: `使用${covariates.map((item) => item.label).join("、")}估计倾向评分；评分截断在${propensityBounds[0].toFixed(2)}—${propensityBounds[1].toFixed(2)}。`,
      diagnosticLabel: "加权后最大SMD", diagnosticValue: weightedMaxSmd(patients, weights).toFixed(2),
      balance: weightedBalance(patients, weights),
      propensitySummary: {
        treatment: distribution(patients.map((patient, i) => patient.tiotropiumExposed ? propensity[i] : null).filter((value) => value != null)),
        control: distribution(patients.map((patient, i) => patient.tiotropiumExposed ? null : propensity[i]).filter((value) => value != null))
      },
      weightSummary: { ...distribution(weights), above10: weights.filter((weight) => weight > 10).length },
      note: "通过稳定化权重构造在已测量暴露前特征上更平衡的伪总体，但这不等于随机分组；仍需检查重叠、极端权重、变量时间顺序和未测量混杂。当前展示点估计，正式推断需使用稳健标准误或Bootstrap。"
    };
  }
  function matching(patients, options = {}) {
    const propensityBounds = options.propensityBounds || [0.05, 0.95];
    const { propensity } = propensityModel(patients, propensityBounds);
    const logits = propensity.map((value) => Math.log(value / (1 - value)));
    const caliper = 0.2 * Math.sqrt(variance(logits));
    const treated = patients.map((patient, index) => ({ patient, index, score: logits[index] })).filter((row) => row.patient.tiotropiumExposed).sort((a, b) => a.score - b.score);
    const controls = patients.map((patient, index) => ({ patient, index, score: logits[index] })).filter((row) => !row.patient.tiotropiumExposed);
    const used = new Set();
    const pairs = [];
    treated.forEach((treatedRow) => {
      let best = null;
      controls.forEach((controlRow) => {
        if (used.has(controlRow.index)) return;
        const distance = Math.abs(treatedRow.score - controlRow.score);
        if (distance <= caliper && (!best || distance < best.distance)) best = { controlRow, distance };
      });
      if (best) {
        used.add(best.controlRow.index);
        pairs.push([treatedRow.patient, best.controlRow.patient]);
      }
    });
    const treatment = pairs.map((pair) => pair[0]);
    const control = pairs.map((pair) => pair[1]);
    const result = basicRates(treatment, control);
    const matchedPatients = pairs.flat();
    const weights = matchedPatients.map(() => 1);
    return {
      id: "matching", label: "倾向评分1:1匹配", ...result,
      tLabel: `匹配后Tiotropium组 · ${result.tEvents}/${treatment.length}例再入院`,
      cLabel: `匹配后对照组 · ${result.cEvents}/${control.length}例再入院`,
      effectLabel: "匹配后相对风险 RR", effectValue: result.relativeRisk, effectCi: null,
      sampleLabel: "成功匹配", sampleValue: `${pairs.length}对`,
      adjustment: `按${covariates.map((item) => item.label).join("、")}估计倾向评分，使用0.2个logit标准差卡钳进行无放回近邻匹配。`,
      diagnosticLabel: "匹配后最大SMD", diagnosticValue: pairs.length ? weightedMaxSmd(matchedPatients, weights).toFixed(2) : "—",
      balance: pairs.length ? weightedBalance(matchedPatients, weights) : [],
      propensitySummary: {
        treatment: distribution(treated.map((row) => propensity[row.index])),
        control: distribution(controls.map((row) => propensity[row.index]))
      },
      unmatchedTreatment: treated.length - pairs.length,
      unmatchedControl: controls.length - pairs.length,
      note: "仅在已测量暴露前特征上寻找相近患者，不能模拟真正随机化；匹配会牺牲样本量，结果代表成功匹配人群。当前展示点估计，正式区间需考虑配对结构。"
    };
  }
  function eValue(relativeRisk, confidenceInterval = null) {
    if (!relativeRisk || relativeRisk === 1) return { point: 1, ci: 1 };
    const transform = (value) => value < 1 ? 1 / value : value;
    const calculate = (value) => value + Math.sqrt(value * (value - 1));
    const point = calculate(transform(relativeRisk));
    let ci = null;
    if (confidenceInterval) {
      const crossesNull = confidenceInterval[0] <= 1 && confidenceInterval[1] >= 1;
      if (crossesNull) ci = 1;
      else {
        const closest = confidenceInterval[1] < 1 ? confidenceInterval[1] : confidenceInterval[0];
        ci = calculate(transform(closest));
      }
    }
    return { point, ci };
  }
  function analyze(patients, method, options = {}) {
    if (method === "multivariable") return multivariable(patients);
    if (method === "iptw") return iptw(patients, options);
    if (method === "matching") return matching(patients, options);
    return crude(patients);
  }

  window.RWS_STATS = { analyze, covariates, eValue };
})();
