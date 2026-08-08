(function () {
  const raw = window.AECOPD_RAW;
  if (!raw?.tables) throw new Error("AECOPD 原始数据包未加载");

  const tables = raw.tables;
  const DAY = 86400000;
  const targetCodes = new Set(["49122", "49322", "496"]);
  const numberFields = new Set([
    "row_id", "subject_id", "hadm_id", "icustay_id", "seq_num", "hospital_expire_flag",
    "expire_flag", "has_chartevents_data", "first_wardid", "last_wardid", "los"
  ]);

  function typed(row) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => {
      if (value === "") return [key, null];
      return [key, numberFields.has(key) ? Number(value) : value];
    }));
  }
  function time(value) {
    if (!value) return NaN;
    return Date.parse(value.length === 10 ? `${value}T00:00:00Z` : `${value.replace(" ", "T")}Z`);
  }
  function dayDiff(later, earlier) { return Math.floor((time(later) - time(earlier)) / DAY); }
  function normalizeCode(value) { return String(value || "").replace(".", "").trim(); }
  function groupBy(rows, key) {
    const map = new Map();
    rows.forEach((row) => {
      const value = row[key];
      if (!map.has(value)) map.set(value, []);
      map.get(value).push(row);
    });
    return map;
  }
  function ageAt(dob, date) {
    return Math.floor((time(date) - time(dob)) / (DAY * 365.2425));
  }

  const patientsRaw = tables.PATIENTS.map(typed);
  const admissions = tables.ADMISSIONS.map(typed).sort((a, b) => time(a.admittime) - time(b.admittime));
  const diagnoses = tables.DIAGNOSES_ICD.map(typed);
  const prescriptions = tables.PRESCRIPTIONS.map(typed);
  const icuStays = tables.ICUSTAYS.map(typed);
  const admissionsByPatient = groupBy(admissions, "subject_id");
  const diagnosesByAdmission = groupBy(diagnoses, "hadm_id");
  const prescriptionsByAdmission = groupBy(prescriptions, "hadm_id");
  const icuByAdmission = groupBy(icuStays, "hadm_id");
  const databaseEnd = admissions.reduce((latest, row) => time(row.dischtime) > time(latest) ? row.dischtime : latest, admissions[0].dischtime);

  function isMainAecopd(admission) {
    return (diagnosesByAdmission.get(admission.hadm_id) || []).some((row) =>
      row.seq_num === 1 && targetCodes.has(normalizeCode(row.icd9_code))
    );
  }
  function hasPrescription(admission) {
    return (prescriptionsByAdmission.get(admission.hadm_id) || []).length > 0;
  }
  function isEligibleAdmission(patient, admission) {
    return ageAt(patient.dob, admission.admittime) >= 50
      && isMainAecopd(admission)
      && admission.hospital_expire_flag === 0
      && admission.admission_type !== "ELECTIVE"
      && hasPrescription(admission);
  }

  const patients = patientsRaw.map((patient) => {
    const patientAdmissions = admissionsByPatient.get(patient.subject_id) || [];
    const indexAdmission = patientAdmissions.find((admission) => isEligibleAdmission(patient, admission)) || null;
    const displayAdmission = indexAdmission || patientAdmissions[0];
    const indexDiagnoses = indexAdmission ? diagnosesByAdmission.get(indexAdmission.hadm_id) || [] : [];
    const indexPrescriptions = indexAdmission ? prescriptionsByAdmission.get(indexAdmission.hadm_id) || [] : [];
    const indexIcuStays = indexAdmission ? icuByAdmission.get(indexAdmission.hadm_id) || [] : [];
    const nextAdmission = indexAdmission
      ? patientAdmissions.find((admission) => time(admission.admittime) > time(indexAdmission.dischtime)) || null
      : null;
    const readmissionGapDays = nextAdmission ? dayDiff(nextAdmission.admittime, indexAdmission.dischtime) : null;
    const readmitted30d = readmissionGapDays != null && readmissionGapDays > 0 && readmissionGapDays <= 30;
    const tiotropiumExposed = indexPrescriptions.some((row) =>
      String(row.drug || "").trim().toLowerCase() === "tiotropium" && row.route === "INH"
    );
    const standardTreatment = indexPrescriptions.some((row) =>
      ["albuterol", "ipratropium"].includes(String(row.drug || "").trim().toLowerCase())
    );
    const primaryDiagnosis = indexDiagnoses.find((row) => row.seq_num === 1) || null;
    const priorAdmissions = indexAdmission
      ? patientAdmissions.filter((admission) => {
          const gap = dayDiff(indexAdmission.admittime, admission.admittime);
          return time(admission.admittime) < time(indexAdmission.admittime) && gap <= 365;
        }).length
      : null;
    const exclusionReasons = [];
    if (!indexAdmission) {
      if (!patientAdmissions.some((admission) => ageAt(patient.dob, admission.admittime) >= 50 && isMainAecopd(admission))) exclusionReasons.push("无年龄≥50岁的主要诊断AECOPD住院");
      if (patientAdmissions.every((admission) => admission.hospital_expire_flag === 1)) exclusionReasons.push("没有存活出院住院");
      if (patientAdmissions.every((admission) => admission.admission_type === "ELECTIVE" || admission.hospital_expire_flag === 1)) exclusionReasons.push("没有符合条件的非择期存活住院");
      if (patientAdmissions.every((admission) => !hasPrescription(admission))) exclusionReasons.push("无完整处方记录");
    }

    return {
      id: String(patient.subject_id),
      subjectId: patient.subject_id,
      encounterId: indexAdmission ? String(indexAdmission.hadm_id) : null,
      name: `虚拟患者 ${patient.subject_id}`,
      age: displayAdmission ? ageAt(patient.dob, displayAdmission.admittime) : null,
      sex: patient.gender === "M" ? "男" : "女",
      diagnosis: indexAdmission ? "AECOPD" : displayAdmission?.diagnosis || "—",
      primaryDiagnosisCode: primaryDiagnosis?.icd9_code || null,
      admissionDate: indexAdmission?.admittime?.slice(0, 10) || null,
      dischargeDate: indexAdmission?.dischtime?.slice(0, 10) || null,
      dischargeStatus: indexAdmission ? "存活出院" : (displayAdmission?.hospital_expire_flag === 1 ? "院内死亡" : "未形成合格索引住院"),
      lengthOfStay: indexAdmission ? dayDiff(indexAdmission.dischtime, indexAdmission.admittime) : null,
      admissionType: indexAdmission?.admission_type || null,
      hasEligibleIndex: Boolean(indexAdmission),
      meetsAgeDiagnosis: patientAdmissions.some((admission) => ageAt(patient.dob, admission.admittime) >= 50 && isMainAecopd(admission)),
      observationDays: indexAdmission ? dayDiff(databaseEnd, indexAdmission.dischtime) : null,
      observationComplete: indexAdmission ? dayDiff(databaseEnd, indexAdmission.dischtime) >= 30 : false,
      tiotropiumExposed: indexAdmission ? tiotropiumExposed : null,
      standardTreatment: indexAdmission ? standardTreatment : null,
      exposureClassified: indexAdmission ? tiotropiumExposed || standardTreatment : false,
      treatment: indexAdmission ? (tiotropiumExposed ? "Tiotropium" : "其他标准治疗") : "未分类",
      readmitted30d: indexAdmission ? readmitted30d : null,
      readmissionDate: readmitted30d ? nextAdmission.admittime.slice(0, 10) : null,
      readmissionGapDays,
      readmissionType: readmitted30d ? nextAdmission.admission_type : null,
      outcomeSource: "AECOPD虚拟住院数据（单一数据源）",
      priorAdmissions,
      icu: indexIcuStays.length > 0,
      comorbidityCount: indexDiagnoses.filter((row) => row.seq_num > 1).length,
      goldGrade: null,
      catBaseline: null,
      smoking: null,
      adherence: null,
      exclusionReasons,
      rawPatient: patient,
      rawAdmissions: patientAdmissions,
      rawIndexAdmission: indexAdmission,
      rawDiagnoses: indexDiagnoses,
      rawPrescriptions: indexPrescriptions,
      rawIcuStays: indexIcuStays
    };
  });

  const hospitalDeathSubjects = new Set(admissions.filter((row) => row.hospital_expire_flag === 1).map((row) => row.subject_id));
  const patientDeathSubjects = new Set(patientsRaw.filter((row) => row.expire_flag === 1).map((row) => row.subject_id));
  const deathOverlap = [...hospitalDeathSubjects].filter((id) => patientDeathSubjects.has(id)).length;

  window.RWS_DATA = {
    patients,
    rawTables: { patients: patientsRaw, admissions, diagnoses, prescriptions, icuStays },
    metadata: {
      source: raw.source,
      generatedAt: raw.generatedAt,
      databaseEnd: databaseEnd.slice(0, 10),
      recordCounts: Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, rows.length])),
      deathQuality: {
        patientExpireCount: patientDeathSubjects.size,
        hospitalDeathCount: hospitalDeathSubjects.size,
        overlapCount: deathOverlap
      }
    }
  };
})();
